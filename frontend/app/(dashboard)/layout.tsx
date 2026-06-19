'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Users, MessageSquare, CheckSquare, FlaskConical, X, LogOut } from 'lucide-react';
import { LogoIcon }          from '@/components/icons/LogoIcon';
import { StoreInitializer }  from '@/components/StoreInitializer';
import { TelegramInboxPoller } from '@/components/TelegramInboxPoller';
import { PortalInboxPoller }   from '@/components/PortalInboxPoller';
import { LocalDataMigrationBanner } from '@/components/LocalDataMigrationBanner';
import { SyncStatusBar }     from '@/components/SyncStatusBar';
import { cn } from '@/lib/utils';
import { useAppStore }     from '@/store/useAppStore';
import { useChatStore }    from '@/store/useChatStore';
import { useAuthStore }    from '@/store/useAuthStore';
import { usePendingStore } from '@/store/usePendingStore';
import { TEST_CREDENTIALS } from '@/constants/client';
import { Button } from '@/components/ui/button';



function DemoBanner() {
  const { demoMode, setDemoMode } = useAppStore();
  const [showCreds, setShowCreds] = useState(false);
  if (!demoMode) return null;
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-xs flex-shrink-0 relative">
      <FlaskConical className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
      <span className="text-amber-700 font-medium flex-1 truncate">Демо-режим</span>
      <button onClick={() => setShowCreds(!showCreds)}
        className="text-amber-600 underline underline-offset-2 hover:text-amber-800 transition-colors flex-shrink-0 hidden sm:block">
        Учётные данные
      </button>
      <Button size="sm" variant="outline"
        className="h-6 px-2 text-[11px] border-amber-300 text-amber-700 hover:bg-amber-100 flex-shrink-0"
        onClick={() => setDemoMode(false)}>
        <X className="h-3 w-3 mr-1" />
        Откл.
      </Button>
      {showCreds && (
        <div className="absolute top-9 right-4 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-4 w-80 text-xs">
          <p className="font-semibold text-slate-800 mb-3">Тестовые учётные данные</p>
          {TEST_CREDENTIALS.map((c) => (
            <div key={c.login} className="mb-3 last:mb-0 p-2.5 rounded-md bg-slate-50 border border-slate-100">
              <p className="font-medium text-slate-700">{c.role}</p>
              <p className="text-muted-foreground text-[11px] mt-0.5">{c.name}</p>
              {c.inn && <p className="text-muted-foreground text-[11px]">ИНН: {c.inn}</p>}
              <div className="mt-2 space-y-0.5 font-mono">
                <p><span className="text-slate-400">Логин: </span><span className="font-semibold text-slate-800">{c.login}</span></p>
                <p><span className="text-slate-400">Пароль: </span><span className="font-semibold text-slate-800">{c.password}</span></p>
              </div>
            </div>
          ))}
          <button onClick={() => setShowCreds(false)} className="mt-2 text-[11px] text-slate-400 hover:text-slate-600">Закрыть</button>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const router    = useRouter();
  const { token, user, logout, _hasHydrated } = useAuthStore();
  const demoMode      = useAppStore((s) => s.demoMode);
  const messages      = useChatStore((s) => s.messages);
  const pendingGroups  = usePendingStore((s) => s.groups);
  const pendingDoneIds = usePendingStore((s) => s.doneIds);

  const unprocessedCount = useMemo(
    () => messages.filter((m) => !m.done && m.senderId !== 'u1').length,
    [messages],
  );
  const pendingCount = useMemo(
    () => Object.values(pendingGroups)
      .reduce((sum, msgs) => sum + msgs.filter((m) => !pendingDoneIds.includes(m.id)).length, 0),
    [pendingGroups, pendingDoneIds],
  );
  const chatBadge = unprocessedCount + pendingCount;

  useEffect(() => {
    if (_hasHydrated && !token) router.replace('/login');
  }, [token, router, _hasHydrated]);

  if (!_hasHydrated) return (
    <div className="flex h-[100dvh] items-center justify-center bg-slate-50">
      <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin" />
    </div>
  );
  if (!token) return null;

  const initials  = user?.name
    ? user.name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'БУ';
  const roleLabel = user?.role === 'CHIEF_ACCOUNTANT' ? 'Главный бухгалтер' : 'Бухгалтер';

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-50">
      <StoreInitializer />
      <TelegramInboxPoller />
      <PortalInboxPoller />
      <LocalDataMigrationBanner />
      <DemoBanner />

      {/* Body row: sidebar (desktop) + main */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── Desktop sidebar ── */}
        <aside className="hidden md:flex md:w-52 md:flex-shrink-0 flex-col bg-white border-r border-slate-100">
          <div className="px-4 py-4 border-b border-slate-100 flex items-center gap-2">
            <LogoIcon className="h-9 w-auto flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold leading-none truncate">{user?.firmName ?? 'BuhgSaaS'}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">ЭДО · Бухгалтерия</p>
            </div>
          </div>
          <nav className="flex-1 p-3 space-y-0.5">
            {NAV.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              const badge    = href === '/chats' && chatBadge > 0 ? chatBadge : 0;
              return (
                <Link key={href} href={href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all',
                    isActive ? 'bg-slate-900 text-white font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {label}
                  {badge > 0 && (
                    <span className={cn(
                      'ml-auto h-4 min-w-[16px] rounded-full text-[9px] font-bold flex items-center justify-center px-1 flex-shrink-0',
                      isActive ? 'bg-white/20 text-white' : 'bg-red-500 text-white',
                    )}>
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t border-slate-100 space-y-1">
            <div className="flex items-center gap-2 px-1 py-1">
              <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{user?.name ?? '—'}</p>
                <p className="text-[10px] text-muted-foreground truncate">{roleLabel}</p>
              </div>
            </div>
            <button onClick={() => { logout(); router.push('/login'); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors">
              <LogOut className="h-3.5 w-3.5" />
              Выйти
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-hidden min-w-0">{children}</main>
      </div>

      {/* ── Mobile bottom navigation ── */}
      <nav className="md:hidden flex-shrink-0 bg-white border-t border-slate-100">
        <div className="flex h-14 items-stretch">
          {NAV.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
            const badge    = href === '/chats' && chatBadge > 0 ? chatBadge : 0;
            return (
              <Link key={href} href={href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors',
                  isActive ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600',
                )}>
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[8px] font-bold rounded-full h-3.5 min-w-[14px] flex items-center justify-center px-0.5 leading-none">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <SyncStatusBar />
    </div>
  );
}
