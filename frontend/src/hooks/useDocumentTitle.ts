import { useEffect } from 'react';

// "<title> · stealthdebug" while the component is shown; null = default title.
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · stealthdebug` : 'stealthdebug';
    return () => { document.title = 'stealthdebug'; };
  }, [title]);
}
