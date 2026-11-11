import { useEffect, useRef, useState } from 'react';
import MediaAPI from '../../api/media.api';
import type { Media } from '../../types/media';

interface MediaLibraryProps {
  items: Media[];
  loading: boolean;
  error: string;
  onInsert: (media: Media) => void;
  onUploadFiles: (files: File[]) => void;
  onChanged: () => void;     // reload the list after an edit/delete
  uploading: number;         // uploads in progress
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function MediaCard({ item, onInsert, onChanged }: {
  item: Media;
  onInsert: (m: Media) => void;
  onChanged: () => void;
}) {
  const [alt, setAlt] = useState(item.alt);
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setAlt(item.alt), [item.alt]);

  const saveAlt = async () => {
    if (alt === item.alt) return;
    try {
      await MediaAPI.updateAlt(item._id, alt);
      setStatus('alt saved');
      onChanged();
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(item.url);
      setStatus('URL copied');
    } catch {
      setStatus(item.url);
    }
  };

  const remove = async () => {
    try {
      await MediaAPI.remove(item._id);
      onChanged();
    } catch (e) {
      setStatus((e as Error).message);
      setConfirmDelete(false);
    }
  };

  const used = item.usedIn.length > 0;

  return (
    <li className="media-card">
      <button type="button" className="media-thumb" onClick={() => onInsert({ ...item, alt })} title="Insert at cursor">
        <img src={item.thumbUrl} alt={alt || item.filename} loading="lazy" decoding="async" />
      </button>

      <div className="media-meta">
        <span className="media-name" title={item.filename}>{item.filename}</span>
        <span className="media-dims">
          {item.width}×{item.height} · {formatSize(item.size)}
        </span>
        {used ? (
          <span className="media-badge used" title={item.usedIn.map((p) => p.title).join('\n')}>
            used in {item.usedIn.length} post{item.usedIn.length > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="media-badge unused">unused</span>
        )}
      </div>

      <input
        className="input media-alt"
        placeholder="alt text"
        value={alt}
        maxLength={300}
        onChange={(e) => setAlt(e.target.value)}
        onBlur={saveAlt}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />

      <div className="media-actions">
        <button type="button" className="btn sm" onClick={() => onInsert({ ...item, alt })}>Insert</button>
        <button type="button" className="btn sm" onClick={copyUrl}>Copy URL</button>
        {confirmDelete ? (
          <>
            <button type="button" className="btn sm danger" onClick={remove}>Confirm</button>
            <button type="button" className="btn sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </>
        ) : (
          <button
            type="button"
            className="btn sm danger"
            disabled={used}
            title={used ? 'Remove it from these posts first:\n' + item.usedIn.map((p) => p.title).join('\n') : 'Delete file'}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        )}
      </div>
      {status && <div className="media-status">{status}</div>}
    </li>
  );
}

function MediaLibrary({ items, loading, error, onInsert, onUploadFiles, onChanged, uploading }: MediaLibraryProps) {
  const [query, setQuery] = useState('');
  const [onlyUnused, setOnlyUnused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const q = query.trim().toLowerCase();
  const visible = items.filter((m) =>
    (!onlyUnused || m.usedIn.length === 0) &&
    (!q || m.filename.toLowerCase().includes(q) || m.alt.toLowerCase().includes(q) || m.originalName.toLowerCase().includes(q))
  );

  const takeFiles = (list: FileList | null) => {
    const files = list ? Array.from(list).filter((f) => f.type.startsWith('image/')) : [];
    if (files.length) onUploadFiles(files);
  };

  return (
    <div className="media-library">
      <div
        className={`dropzone compact ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); takeFiles(e.dataTransfer.files); }}
        onClick={() => fileInput.current?.click()}
      >
        {uploading > 0 ? `Uploading ${uploading}…` : <>Drop images or <strong>click to upload</strong></>}
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          ref={fileInput}
          hidden
          onChange={(e) => { takeFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      <div className="media-filters">
        <input
          className="input"
          placeholder="search name or alt…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="media-checkbox">
          <input type="checkbox" checked={onlyUnused} onChange={(e) => setOnlyUnused(e.target.checked)} />
          unused only
        </label>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && items.length === 0 && <p className="sidebar-empty">Loading…</p>}
      {!loading && visible.length === 0 && <p className="sidebar-empty">No images{q || onlyUnused ? ' match' : ' yet'}</p>}

      <ul className="media-grid">
        {visible.map((m) => (
          <MediaCard key={m._id} item={m} onInsert={onInsert} onChanged={onChanged} />
        ))}
      </ul>
    </div>
  );
}

export default MediaLibrary;
