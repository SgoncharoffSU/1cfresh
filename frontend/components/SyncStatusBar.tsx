'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API } from '@/lib/api';

type SyncState = 'idle' | 'syncing' | 'ok' | 'error';

export function SyncStatusBar() {
  const [lastSync,   setLastSync]   = useState<Date | null>(null);
  const [syncState,  setSyncState]  = useState<SyncState>('idle');
  const [result,     setResult]     = useState('');
  const [now,        setNow]        = useState(() => new Date());

  // Tick every minute for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const fetchLastSync = useCallback(async () => {
    try {
      const res = await fetch(API.documents.list());
      if (!res.ok) return;
      const docs: { synced_at: string }[] = await res.json();
      if (docs.length > 0) {
        const maxTs = docs.reduce(
          (m, d) => (d.synced_at > m ? d.synced_at : m),
          docs[0].synced_at,
        );
        setLastSync(new Date(maxTs));
      }
    } catch {}
  }, []);

  useEffect(() => { fetchLastSync(); }, [fetchLastSync]);

  const handleSync = useCallback(async () => {
    if (syncState === 'syncing') return;
    setSyncState('syncing');
    setResult('');
    try {
      const res = await fetch(API.documents.sync(), { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const inv  = data.invoices ?? 0;
      const sal  = data.sales   ?? 0;
      setResult(`+${inv + sal} документов`);
      setSyncState('ok');
      setLastSync(new Date());
    } catch (e) {
      setResult('Ошибка синхронизации');
      setSyncState('error');
    }
    setTimeout(() => setSyncState('idle'), 5000);
  }, [syncState]);

  // Next auto-sync countdown
  const nextSync  = lastSync ? new Date(lastSync.getTime() + 10 * 60 * 1000) : null;
  const diffMs    = nextSync ? nextSync.getTime() - now.getTime() : null;
  const minsLeft  = diffMs && diffMs > 0 ? Math.ceil(diffMs / 60_000) : 0;

  const dot = {
    idle:    'bg-emerald-500',
    syncing: 'bg-amber-400 animate-pulse',
    ok:      'bg-emerald-500',
    error:   'bg-red-500',
  }[syncState];

  return (
    <div className="flex-shrink-0 h-7 bg-slate-900 text-slate-400 text-[11px]
                    px-4 flex items-center justify-between gap-4 select-none">

      {/* Left: status */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', dot)} />

        {syncState === 'syncing' && (
          <span className="text-amber-300">Синхронизация с 1С…</span>
        )}
        {syncState === 'ok' && (
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> Готово · {result}
          </span>
        )}
        {syncState === 'error' && (
          <span className="flex items-center gap-1 text-red-400">
            <AlertCircle className="h-3 w-3" /> {result}
          </span>
        )}
        {syncState === 'idle' && (
          <span>
            {lastSync
              ? `1С · обновлено ${lastSync.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
              : '1С · нет данных'}
            {minsLeft > 0 && (
              <span className="text-slate-600 ml-2">· авто через {minsLeft} мин</span>
            )}
          </span>
        )}
      </div>

      {/* Right: sync button */}
      <button
        onClick={handleSync}
        disabled={syncState === 'syncing'}
        title="Синхронизировать сейчас"
        className="flex items-center gap-1 hover:text-slate-200 disabled:opacity-40 transition-colors flex-shrink-0"
      >
        <RefreshCw className={cn('h-3 w-3', syncState === 'syncing' && 'animate-spin')} />
        <span>{syncState === 'syncing' ? 'Идёт синхронизация' : 'Синхронизировать'}</span>
      </button>
    </div>
  );
}
