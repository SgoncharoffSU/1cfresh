import { create } from 'zustand';

export type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  syncFromDom: () => void;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  try { localStorage.setItem('theme', theme); } catch {}
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  // Actual default is decided by the inline script in app/layout.tsx (runs before
  // hydration, reads localStorage) — this initial value is just a placeholder until
  // syncFromDom() reconciles it on mount, so there is no light->dark flash either way.
  theme: 'light',
  setTheme: (theme) => { applyTheme(theme); set({ theme }); },
  toggleTheme: () => {
    const next: Theme = get().theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    set({ theme: next });
  },
  syncFromDom: () => {
    const isDark = document.documentElement.classList.contains('dark');
    set({ theme: isDark ? 'dark' : 'light' });
  },
}));
