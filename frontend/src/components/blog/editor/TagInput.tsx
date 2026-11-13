import { useState } from 'react';

// Same rules as the backend (normalizeTags): lowercase, no "#", spaces -> "-"
function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').replace(/[^a-z0-9+.-]/g, '').slice(0, 30);
}

export default function TagInput({ value, onChange, disabled }: { value: string[]; onChange: (t: string[]) => void; disabled?: boolean }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const t = normalizeTag(raw);
    if (t && !value.includes(t) && value.length < 8) onChange([...value, t]);
    setText('');
  };
  return (
    <div className="input tag-input" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}>
      {value.map((t) => (
        <span key={t} className="tag accent">
          #{t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
        </span>
      ))}
      <input
        id="post-tags"
        value={text}
        disabled={disabled || value.length >= 8}
        placeholder={value.length ? '' : 'firmware, uart… (enter to add)'}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(',') && v.trim() !== ',') add(v.slice(0, -1)); else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (text.trim()) add(text); }
          else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text.trim() && add(text)}
      />
    </div>
  );
}

