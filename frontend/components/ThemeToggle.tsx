'use client';

import { useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme, syncFromDom } = useThemeStore();

  // Reconcile store state with whatever the pre-hydration inline script (see
  // app/layout.tsx) already applied to <html>, so the icon shown matches reality.
  useEffect(() => { syncFromDom(); }, [syncFromDom]);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      className={cn(
        'p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100',
        'dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10',
        'transition-colors',
        className,
      )}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
