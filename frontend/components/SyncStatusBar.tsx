'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API, apiFetch } from '@/lib/api';
import { useClientStore } from '@/store/useClientStore';

type SyncState = 'idle' | 'syncing' | 'ok' | 'error';

export function SyncStatusBar() {
  const clients = useClientStore((s) => s.clients);
  const onecClientIds = clients.filter((c) => c.activeChannels.includes('1C')).map((c) => c.id);

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
    if (onecClientIds.length === 0) return;
    try {
      const results = await Promise.all(
        onecClientIds.map((id) => apiFetch(API.documents.list(id)).then((r) => r.ok ? r.json() : [])),
      );
      const allDocs: { synced_at: string }[] = results.flat();
      if (allDocs.length > 0) {
        const maxTs = allDocs.reduce((m, d) => (d.synced_at > m ? d.synced_at : m), allDocs[0].synced_at);
        setLastSync(new Date(maxTs));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onecClientIds.join(',')]);

  useEffect(() => { fetchLastSync(); }, [fetchLastSync]);

  const handleSync = useCallback(async () => {
    if (syncState === 'syncing' || onecClientIds.length === 0) return;
    setSyncState('syncing');
    setResult('');
    try {
      const results = await Promise.all(
        onecClientIds.map((id) =>
          apiFetch(API.documents.sync(id), { method: 'POST' }).then((r) => r.ok ? r.json() : { invoices: 0, sales: 0 })
        ),
      );
      const total = results.reduce((sum, d) => sum + (d.invoices ?? 0) + (d.sales ?? 0), 0);
      setResult(`+${total} документов · ${onecClientIds.length} клиентов`);
      setSyncState('ok');
      setLastSync(new Date());
    } catch {
      setResult('Ошибка синхронизации');
      setSyncState('error');
    }
    setTimeout(() => setSyncState('idle'), 5000);
  }, [syncState, onecClientIds]);

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
            {onecClientIds.length === 0
              ? '1С · нет подключённых клиентов'
              : lastSync
                ? `1С · обновлено ${lastSync.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} · ${onecClientIds.length} клиентов`
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
        disabled={syncState === 'syncing' || onecClientIds.length === 0}
        title="Синхронизировать все подключённые 1С"
        className="flex items-center gap-1 hover:text-slate-200 disabled:opacity-40 transition-colors flex-shrink-0"
      >
        <RefreshCw className={cn('h-3 w-3', syncState === 'syncing' && 'animate-spin')} />
        <span>{syncState === 'syncing' ? 'Идёт синхронизация' : 'Синхронизировать'}</span>
      </button>
    </div>
  );
}
