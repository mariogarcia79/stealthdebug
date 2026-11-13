import { EditorView } from '@codemirror/view';
import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// ---------------------------------------------------------------------------
// Editor look: the site palette via CSS variables (styles/tokens.css), so it
// follows the light/dark theme without rebuilding the editor
// ---------------------------------------------------------------------------
export const editorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--bg)',
      color: 'var(--text)',
      border: '1px solid var(--line)', borderRadius: 'var(--radius)',
      fontSize: '0.95rem',
      height: '100%',
    },
    '&.cm-focused': { outline: 'none', borderColor: 'var(--accent)' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
    '.cm-content': { caretColor: 'var(--accent)', padding: '0.75rem 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--selection) !important',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--surface)',
      color: 'var(--line-hi)',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'var(--hover-bg)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--meta)' },
  },
);

export const markdownHighlight = HighlightStyle.define([
  { tag: t.heading, color: 'var(--accent)', fontWeight: 'bold' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--accent)' },
  { tag: t.monospace, color: 'var(--code-mono)' },
  { tag: t.quote, color: 'var(--meta)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: 'var(--line-hi)' },
  { tag: t.list, color: 'var(--accent)' },
  // code inside fenced blocks (language-data)
  { tag: t.keyword, color: 'var(--code-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--code-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--code-number)' },
  { tag: t.comment, color: 'var(--meta)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--code-fn)' },
  { tag: [t.typeName, t.className], color: 'var(--code-type)' },
]);

