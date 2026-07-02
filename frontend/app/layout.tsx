import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: 'BuhgSaaS — Автоматизация бухгалтерии и ЭДО',
  description: 'Платформа автоматизации выставления счетов, ЭДО и омниканального чата',
};

// Runs before hydration to apply the saved theme with zero light->dark flash.
// Defaults to light (not system preference) — light-by-default is a deliberate
// product decision, dark mode is opt-in via the toggle, not OS-inherited.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
