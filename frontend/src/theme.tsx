import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

// Light / dark theme. public/theme-init.js sets <html data-theme> before the
// first paint; this keeps it in sync with the visitor's choice and, for
// "system", with the operating system's setting as it changes.

export type ThemeChoice = 'dark' | 'light' | 'system';
export const THEME_CHOICES: ThemeChoice[] = ['dark', 'light', 'system'];
const KEY = 'theme';

const systemTheme = () => (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'system') return v;
  } catch { /* storage blocked: the default */ }
  return 'dark';   // the site's look unless the visitor picks otherwise
}

interface ThemeValue {
  choice: ThemeChoice;            // what the visitor picked
  theme: 'dark' | 'light';        // what is shown
  setChoice: (c: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const [system, setSystem] = useState<'dark' | 'light'>(systemTheme);
  const theme = choice === 'system' ? system : choice;

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return;
    const onChange = () => setSystem(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    try {
      if (c === 'dark') localStorage.removeItem(KEY); else localStorage.setItem(KEY, c);
    } catch { /* not remembered: still applies to this visit */ }
  }, []);

  return <ThemeContext.Provider value={{ choice, theme, setChoice }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
