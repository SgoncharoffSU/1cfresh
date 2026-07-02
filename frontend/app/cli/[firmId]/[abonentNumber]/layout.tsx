'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuthStore } from '@/store/usePortalAuthStore';

export default function AbonentPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { firmId: firmIdParam, abonentNumber: abonentNumberParam } = useParams<{
    firmId: string; abonentNumber: string;
  }>();
  const { token, firmId, abonentNumber, _hasHydrated } = usePortalAuthStore();

  // Frontend guard only (UX) — the backend always scopes chat/documents from the
  // abonent JWT itself (see get_current_abonent in app/api/portal.py), never from
  // this URL, so this redirect can't be relied on for isolation.
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) { router.replace(`/cli/${firmIdParam}/login`); return; }
    if (String(firmId) !== firmIdParam || String(abonentNumber) !== abonentNumberParam) {
      router.replace(`/cli/${firmIdParam}/login`);
    }
  }, [token, firmId, abonentNumber, firmIdParam, abonentNumberParam, router, _hasHydrated]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      {children}
    </div>
  );
}
