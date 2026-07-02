'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogOut, Building2, ScrollText } from 'lucide-react';
import { LogoIcon } from '@/components/icons/LogoIcon';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';
import { useSuperAdminAuthStore } from '@/store/useSuperAdminAuthStore';

const NAV = [
  { href: '/superadmin/firms', label: 'Аккаунты', icon: Building2 },
  { href: '/superadmin/audit', label: 'Аудит',     icon: ScrollText },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router    = useRouter();
  const { token, superAdmin, logout, _hasHydrated } = useSuperAdminAuthStore();

  const isLoginPage = pathname === '/superadmin/login';

  useEffect(() => {
    if (!_hasHydrated || isLoginPage) return;
    if (!token) router.replace('/superadmin/login');
  }, [_hasHydrated, token, isLoginPage, router]);

  if (isLoginPage) return <>{children}</>;

  if (!_hasHydrated) return (
    <div className="flex h-[100dvh] items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="h-8 w-8 rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-slate-600 dark:border-t-slate-300 animate-spin" />
    </div>
  );
  if (!token) return null;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="flex-shrink-0 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoIcon className="h-7 w-auto" />
          <div>
            <p className="text-sm font-bold leading-none">Суперадмин</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5">Техподдержка glavinstrument</p>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-slate-900 dark:bg-slate-800 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900',
                )}>
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="text-xs text-slate-500 dark:text-slate-400">{superAdmin?.name}</span>
          <button onClick={() => { logout(); router.push('/superadmin/login'); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
            <LogOut className="h-3.5 w-3.5" />
            Выйти
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
