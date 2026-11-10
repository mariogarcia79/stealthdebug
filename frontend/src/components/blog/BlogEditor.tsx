import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

import PostAPI from '../../api/posts.api';
import MediaAPI from '../../api/media.api';
import { useAuth } from '../../context/AuthContext';
import {
  validatePost,
  MAX_TITLE_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_CONTENT_LENGTH,
} from '../../utils/validation';
import MarkdownRenderer from './MarkdownRenderer';
import MediaLibrary from './MediaLibrary';
import type { Media, PostImages } from '../../types/media';

// ---------------------------------------------------------------------------
// Editor look: matches the site palette (CSS variables in globals.css)
// ---------------------------------------------------------------------------
const editorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--color-dark-0)',
      color: 'var(--color-text-0)',
      border: '1px solid var(--color-subtle-general)',
      fontSize: '0.95rem',
      height: '100%',
    },
    '&.cm-focused': { outline: 'none', borderColor: 'var(--color-text-0)' },
    '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.55' },
    '.cm-content': { caretColor: 'var(--color-accent-general)', padding: '0.75rem 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-accent-general)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(71, 235, 180, 0.22) !important',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--color-dark-1)',
      color: 'var(--color-subtle-general)',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.03)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--color-text-1)' },
  },
  { dark: true }
);

const markdownHighlight = HighlightStyle.define([
  { tag: t.heading, color: 'var(--color-accent-general)', fontWeight: 'bold' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--color-accent-note)' },
  { tag: t.monospace, color: '#f0c674' },
  { tag: t.quote, color: 'var(--color-text-1)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: 'var(--color-subtle-general)' },
  { tag: t.list, color: 'var(--color-accent-general)' },
  // code inside fenced blocks (language-data)
  { tag: t.keyword, color: '#c792ea' },
  { tag: [t.string, t.special(t.string)], color: '#c3e88d' },
  { tag: [t.number, t.bool, t.null], color: '#f78c6c' },
  { tag: t.comment, color: 'var(--color-text-1)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#82aaff' },
  { tag: [t.typeName, t.className], color: '#ffcb6b' },
]);

// ---------------------------------------------------------------------------
// Markdown editing commands
// ---------------------------------------------------------------------------

// Wrap each selection (or insert `before placeholder after` and select the placeholder).
function wrap(view: EditorView, before: string, after: string, placeholder: string) {
  view.dispatch(
    view.state.changeByRange((range) => {
      const text = view.state.sliceDoc(range.from, range.to) || placeholder;
      const insert = before + text + after;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(range.from + before.length, range.from + before.length + text.length),
      };
    })
  );
  view.focus();
}

// Toggle a prefix ("## ", "> ", "- ") on every line touched by the selection.
function prefixLines(view: EditorView, prefix: string) {
  const { state } = view;
  const changes: { from: number; to?: number; insert: string }[] = [];
  const seen = new Set<number>();
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos);
      if (!seen.has(line.number)) {
        seen.add(line.number);
        if (line.text.startsWith(prefix)) {
          changes.push({ from: line.from, to: line.from + prefix.length, insert: '' });
        } else {
          // replace another heading level instead of stacking "## ### "
          const existing = /^(#{1,6} |> |- )/.exec(line.text);
          const strip = existing && prefix.match(/^(#{1,6} |> |- )$/) ? existing[0].length : 0;
          changes.push({ from: line.from, to: line.from + strip, insert: prefix });
        }
      }
      pos = line.to + 1;
    }
  }
  view.dispatch({ changes });
  view.focus();
}

// Insert text on its own line(s) at the cursor.
function insertBlock(view: EditorView, text: string, at?: number) {
  const pos = at ?? view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const needsNewlineBefore = line.text.trim().length > 0 && pos !== line.from;
  const insert = (needsNewlineBefore ? '\n\n' : '') + text + '\n';
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
    scrollIntoView: true,
  });
  view.focus();
}

function altFromFilename(filename: string): string {
  return filename
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/-\d{10,}-[A-Za-z0-9]{6}$/, '')   // strip "-<timestamp>-<random>"
    .replace(/[-_]+/g, ' ')
    .trim();
}

function imageMarkdown(m: Media): string {
  const alt = (m.alt || altFromFilename(m.filename)).replace(/[[\]]/g, '');
  return `![${alt}](${m.url})`;
}

function imagesFromLibrary(items: Media[]): PostImages {
  const out: PostImages = {};
  for (const m of items) {
    out[m.filename] = {
      width: m.width,
      height: m.height,
      variants: m.variants.map((v) => ({ width: v.width, url: v.url })),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Drafts (per post, in this browser only)
// ---------------------------------------------------------------------------
interface Snapshot { title: string; summary: string; content: string }
interface Draft extends Snapshot { savedAt: number }

const draftKey = (id?: string) => `stealthdebug:draft:${id ?? 'new'}`;

function readDraft(id?: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(id: string | undefined, s: Snapshot) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify({ ...s, savedAt: Date.now() }));
  } catch { /* storage full or disabled: drafts are a convenience */ }
}
function clearDraft(id?: string) {
  try { localStorage.removeItem(draftKey(id)); } catch { /* ignore */ }
}
const same = (a: Snapshot, b: Snapshot) =>
  a.title === b.title && a.summary === b.summary && a.content === b.content;

// ---------------------------------------------------------------------------

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function BlogEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { isLoggedIn } = useAuth();
  const isEditing = !!id;

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState<Snapshot>({ title: '', summary: '', content: '' });
  const [loaded, setLoaded] = useState(!isEditing);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [draftOffer, setDraftOffer] = useState<Draft | null>(null);

  const [tab, setTab] = useState<'preview' | 'media'>('preview');
  const [media, setMedia] = useState<Media[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [uploading, setUploading] = useState(0);
  const [postImages, setPostImages] = useState<PostImages>({});

  const cm = useRef<ReactCodeMirrorRef>(null);
  const current: Snapshot = { title, summary, content };
  const dirty = loaded && !same(current, saved);
  const contentTooLong = content.length > MAX_CONTENT_LENGTH;

  useEffect(() => {
    if (!isLoggedIn) navigate('/login');
  }, [isLoggedIn, navigate]);

  // Load the post (or start empty), then offer a newer local draft if any.
  useEffect(() => {
    let cancelled = false;
    const start = (s: Snapshot) => {
      if (cancelled) return;
      setTitle(s.title); setSummary(s.summary); setContent(s.content);
      setSaved(s); setLoaded(true);
      const draft = readDraft(id);
      if (draft && !same(draft, s)) setDraftOffer(draft);
    };
    if (id) {
      setLoaded(false);
      PostAPI.getPostById(id)
        .then((post) => {
          setPostImages(post.images ?? {});
          start({ title: post.title, summary: post.summary, content: post.content });
        })
        .catch(() => !cancelled && setError('Failed to load post'));
    } else {
      start({ title: '', summary: '', content: '' });
    }
    return () => { cancelled = true; };
  }, [id]);

  // Autosave a local draft while there are unsaved changes.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      if (dirty) writeDraft(id, current); else clearDraft(id);
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, summary, content, loaded, dirty, id]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Media library
  const loadMedia = useCallback(async () => {
    setMediaLoading(true);
    try {
      setMedia(await MediaAPI.list());
      setMediaError('');
    } catch (e) {
      setMediaError((e as Error).message);
    } finally {
      setMediaLoading(false);
    }
  }, []);
  useEffect(() => { loadMedia(); }, [loadMedia]);

  const previewImages = useMemo(
    () => ({ ...postImages, ...imagesFromLibrary(media) }),
    [postImages, media]
  );

  // Save
  const save = useCallback(async () => {
    if (saveState === 'saving') return;
    const clientError = validatePost(title, summary, content);
    if (clientError) { setError(clientError); setSaveState('error'); return; }

    setSaveState('saving');
    setError('');
    const snapshot = { title, summary, content };
    try {
      if (isEditing && id) {
        await PostAPI.updatePost(id, snapshot);
        setSaved(snapshot);
        clearDraft(id);
      } else {
        const post = await PostAPI.createPost(title, summary, content);
        clearDraft(undefined);
        setSaved(snapshot);
        navigate(`/blog/edit/${post._id}`, { replace: true });
      }
      setSaveState('saved');
      loadMedia();   // "used in" counts changed
    } catch (err: any) {
      setError(err?.message || 'Failed to save.');
      setSaveState('error');
    }
  }, [saveState, title, summary, content, isEditing, id, navigate, loadMedia]);

  // Ctrl/Cmd+S anywhere on the page
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (dirty && saveState === 'saved') setSaveState('idle'); }, [dirty, saveState]);

  // Uploads: insert a placeholder at the cursor, replace it when done.
  const uploadFiles = useCallback(async (files: File[], at?: number) => {
    const view = cm.current?.view;
    for (const file of files) {
      const token = `uploading-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const placeholder = `![Uploading ${file.name.replace(/[[\]()]/g, '')}…](${token})`;
      if (view) insertBlock(view, placeholder, at);
      setUploading((n) => n + 1);
      try {
        const m = await MediaAPI.upload(file);
        setMedia((list) => [m, ...list.filter((x) => x._id !== m._id)]);
        const v = cm.current?.view;
        if (v) {
          const idx = v.state.doc.toString().indexOf(placeholder);
          if (idx >= 0) v.dispatch({ changes: { from: idx, to: idx + placeholder.length, insert: imageMarkdown(m) } });
          else insertBlock(v, imageMarkdown(m));
        }
      } catch (e) {
        setMediaError((e as Error).message);
        const v = cm.current?.view;
        if (v) {
          const idx = v.state.doc.toString().indexOf(placeholder);
          if (idx >= 0) v.dispatch({ changes: { from: idx, to: idx + placeholder.length + 1, insert: '' } });
        }
      } finally {
        setUploading((n) => n - 1);
      }
      at = undefined; // subsequent files go after the previous one
    }
  }, []);

  const uploadRef = useRef(uploadFiles);
  uploadRef.current = uploadFiles;

  const insertMedia = (m: Media) => {
    const view = cm.current?.view;
    if (view) insertBlock(view, imageMarkdown(m));
  };

  // CodeMirror extensions (stable: callbacks go through refs)
  const extensions = useMemo(() => [
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(markdownHighlight),
    EditorView.lineWrapping,
    keymap.of([
      { key: 'Mod-b', run: (v) => { wrap(v, '**', '**', 'bold'); return true; } },
      { key: 'Mod-i', run: (v) => { wrap(v, '_', '_', 'italic'); return true; } },
      { key: 'Mod-e', run: (v) => { wrap(v, '`', '`', 'code'); return true; } },
      { key: 'Mod-k', run: (v) => { wrap(v, '[', '](https://)', 'link text'); return true; } },
    ]),
    EditorView.domEventHandlers({
      paste(event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        uploadRef.current(files);
        return true;
      },
      drop(event, view) {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? undefined;
        uploadRef.current(files, pos);
        return true;
      },
    }),
    editorTheme,
  ], []);

  const run = (fn: (v: EditorView) => void) => () => {
    const v = cm.current?.view;
    if (v) fn(v);
  };

  const status =
    saveState === 'saving' ? 'Saving…'
    : !loaded ? 'Loading…'
    : dirty ? 'Unsaved changes'
    : saveState === 'saved' ? 'Saved'
    : isEditing ? 'No changes' : '';

  return (
    <div className="page-container">
      <div className="post-editor">
        <div className="post-editor-header">
          <Link to={isEditing ? `/blog/${id}` : '/blog'} className="link">$ cd ../</Link>
          <h1 className="title">{isEditing ? 'Edit post' : 'New post'}</h1>
          <span className={`editor-status ${dirty ? 'dirty' : ''}`}>{status}</span>
          {isEditing && (
            <Link to={`/blog/${id}`} className="button compact" target="_blank" rel="noopener noreferrer">
              View
            </Link>
          )}
          <button
            className="button compact"
            onClick={save}
            disabled={!loaded || saveState === 'saving' || contentTooLong || (isEditing && !dirty)}
            title="Ctrl+S"
          >
            {isEditing ? 'Save' : 'Publish'}
          </button>
        </div>

        {error && <div className="error block">{error}</div>}

        {draftOffer && (
          <div className="draft-banner">
            You have an unsaved local draft from {new Date(draftOffer.savedAt).toLocaleString()}.
            <button className="button compact" onClick={() => {
              setTitle(draftOffer.title); setSummary(draftOffer.summary); setContent(draftOffer.content);
              setDraftOffer(null);
            }}>Restore</button>
            <button className="button compact" onClick={() => { clearDraft(id); setDraftOffer(null); }}>Discard</button>
          </div>
        )}

        <input
          type="text"
          placeholder="Title"
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(e) => setTitle(e.target.value)}
          className="input wide"
          disabled={!loaded}
        />
        <div className="char-counter">{title.length} / {MAX_TITLE_LENGTH}</div>

        <textarea
          placeholder="Summary (shown in the post list and under the title)"
          value={summary}
          maxLength={MAX_SUMMARY_LENGTH}
          onChange={(e) => setSummary(e.target.value)}
          className="textarea post-summary"
          disabled={!loaded}
        />
        <div className="char-counter">{summary.length} / {MAX_SUMMARY_LENGTH}</div>

        <div className="post-editor-panes">
          <section className="post-editor-pane">
            <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
              <button type="button" onClick={run((v) => prefixLines(v, '## '))} title="Heading 2">H2</button>
              <button type="button" onClick={run((v) => prefixLines(v, '### '))} title="Heading 3">H3</button>
              <button type="button" onClick={run((v) => wrap(v, '**', '**', 'bold'))} title="Bold (Ctrl+B)"><b>B</b></button>
              <button type="button" onClick={run((v) => wrap(v, '_', '_', 'italic'))} title="Italic (Ctrl+I)"><i>I</i></button>
              <button type="button" onClick={run((v) => wrap(v, '`', '`', 'code'))} title="Inline code (Ctrl+E)">`c`</button>
              <button type="button" onClick={run((v) => wrap(v, '\n```bash\n', '\n```\n', 'code'))} title="Code block">```</button>
              <button type="button" onClick={run((v) => wrap(v, '[', '](https://)', 'link text'))} title="Link (Ctrl+K)">link</button>
              <button type="button" onClick={run((v) => prefixLines(v, '> '))} title="Quote">&gt;</button>
              <button type="button" onClick={run((v) => prefixLines(v, '- '))} title="List">•</button>
              <button type="button" onClick={() => setTab('media')} title="Insert image from library">img</button>
              <span className={`char-counter inline ${contentTooLong ? 'exceeded' : ''}`}>
                {content.length} / {MAX_CONTENT_LENGTH}
              </span>
            </div>
            <CodeMirror
              ref={cm}
              value={content}
              onChange={setContent}
              extensions={extensions}
              theme="none"
              editable={loaded}
              placeholder="Write markdown… paste or drop images here to upload them"
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                autocompletion: false,
                highlightActiveLine: true,
                highlightSelectionMatches: false,
                searchKeymap: true,
                syntaxHighlighting: false,
              }}
              className="post-editor-cm"
            />
          </section>

          <section className="post-editor-pane">
            <div className="editor-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'preview'}
                className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}>Preview</button>
              <button type="button" role="tab" aria-selected={tab === 'media'}
                className={tab === 'media' ? 'active' : ''} onClick={() => setTab('media')}>
                Media ({media.length})
              </button>
            </div>
            <div className="editor-side">
              {tab === 'preview' ? (
                <div className="post-content preview">
                  <h1 className="title large left"> # {title || 'Untitled'}</h1>
                  <div className="post-summary">{summary}</div>
                  <div className="post-body">
                    <MarkdownRenderer content={content} images={previewImages} />
                  </div>
                </div>
              ) : (
                <MediaLibrary
                  items={media}
                  loading={mediaLoading}
                  error={mediaError}
                  uploading={uploading}
                  onInsert={insertMedia}
                  onUploadFiles={(files) => uploadFiles(files)}
                  onChanged={loadMedia}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default BlogEditor;
