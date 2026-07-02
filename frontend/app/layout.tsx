import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: 'BuhgSaaS — Автоматизация бухгалтерии и ЭДО',
  description: 'Платформа автоматизации выставления счетов, ЭДО и омниканального чата',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" style={{ colorScheme: 'light' }}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
