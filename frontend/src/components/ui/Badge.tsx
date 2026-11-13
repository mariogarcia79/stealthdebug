import type { ReactNode } from 'react';

// Small status label. tone: ok (accent), warn, danger, neutral (default).
export type Tone = 'ok' | 'warn' | 'danger' | 'neutral';

export default function Badge({ tone = 'neutral', plain = false, children, title }: { tone?: Tone; plain?: boolean; children: ReactNode; title?: string }) {
  return <span className={`badge ${tone === 'neutral' ? '' : tone}${plain ? ' plain' : ''}`} title={title}>{children}</span>;
}
