'use client';
import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, MessageSquare, MessageCircle, Zap, FileText, ChevronRight, RefreshCw, CheckCircle2, Trash2 } from 'lucide-react';
import { useClientStore } from '@/store/useClientStore';
import { useChatStore }   from '@/store/useChatStore';
import { Button }         from '@/components/ui/button';
import { TelegramIcon }   from '@/components/icons/TelegramIcon';
import { AiChatIcon }     from '@/components/icons/AiChatIcon';
import { IntegrationKey } from '@/types';
import { cn, formatTime } from '@/lib/utils';
import { API } from '@/lib/api';

const CH_ICON: Record<IntegrationKey, React.ReactNode> = {
  TG:            <TelegramIcon className="h-3 w-3" />,
  VK:            <MessageCircle className="h-3 w-3" />,
  INTERNAL_CHAT: <MessageSquare className="h-3 w-3" />,
  MAX:           <Zap className="h-3 w-3" />,
  '1C':          <span className="text-[9px] font-bold leading-none">1С</span>,
  MOYSKLAD:      <span className="text-[9px] font-bold leading-none">МС</span>,
  B24:           <span className="text-[9px] font-bold leading-none">B</span>,
  DIADOC:        <FileText className="h-3 w-3" />,
  PORTAL:        <AiChatIcon className="h-3 w-3" />,
};

export function ClientsList() {
  const { clients, addFromApi, removeClient } = useClientStore();
  const { messages, removeClientMessages }    = useChatStore();
  const [syncing,   setSyncing]   = useState(false);
  const [syncDone,  setSyncDone]  = useState(false);
  const [lastSync,  setLastSync]  = useState<Date | null>(null);
  const [syncInfo,  setSyncInfo]  = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const loadCounterparties = useCallback(async () => {
    try {
      const res = await fetch(API.documents.counterparties());
      if (res.ok) addFromApi(await res.json());
    } catch {}
  }, [addFromApi]);

  const fetchLastSync = useCallback(async () => {
    try {
      const res = await fetch(API.documents.list());
      if (res.ok) {
        const docs: { synced_at: string }[] = await res.json();
        if (docs.length > 0) {
          const maxTs = docs.reduce((m, d) => (d.synced_at > m ? d.synced_at : m), docs[0].synced_at);
          setLastSync(new Date(maxTs));
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadCounterparties();
    fetchLastSync();
  }, [loadCounterparties, fetchLastSync]);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncDone(false);
    setSyncInfo('');
    try {
      const res = await fetch(API.documents.sync(), { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        await loadCounterparties();
        await fetchLastSync();
        const n = (data.invoices ?? 0) + (data.sales ?? 0);
        setSyncInfo(`+${n} документов`);
        setSyncDone(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setSyncDone(false), 5000);
      }
    } finally {
      setSyncing(false);
    }
  }, [syncing, loadCounterparties, fetchLastSync]);

  const handleDelete = useCallback((clientId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeClient(clientId);
    removeClientMessages(clientId);
    setDeleteConfirmId(null);
  }, [removeClient, removeClientMessages]);

  const enriched = useMemo(() => clients.map((c) => {
    const msgs        = messages.filter((m) => m.clientId === c.id);
    const unread      = msgs.filter((m) => !m.read && !m.done && m.senderId !== 'u1').length;
    const unprocessed = msgs.filter((m) => !m.done && m.senderId !== 'u1').length;
    const sorted      = [...msgs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return { ...c, unread, unprocessed, last: sorted[0] };
  }), [clients, messages]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Клиенты</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{clients.length} контрагентов</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            title="Синхронизировать сейчас"
            onClick={handleSync}
            disabled={syncing}
            className={cn(
              'h-8 flex items-center gap-1.5 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-500 text-xs',
              'hover:bg-slate-50 hover:text-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              syncDone && 'border-emerald-300 bg-emerald-50 text-emerald-600',
            )}
          >
            {syncDone
              ? <><CheckCircle2 className="h-3.5 w-3.5" /><span>Готово</span></>
              : <><RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} /><span>{syncing ? 'Синхронизация…' : '1С'}</span></>
            }
          </button>
          <Button size="sm" className="gap-1.5 h-8 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Добавить
          </Button>
        </div>
      </div>

      {/* Registry table */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center px-4 py-2 border-b border-slate-100 bg-slate-50">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Контрагент</span>
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide w-28 text-center">Каналы</span>
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide w-24 text-right">Последнее</span>
          <span className="w-6" />
          <span className="w-12" />
        </div>

        {enriched.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2 text-muted-foreground">
            <p className="text-sm">Нет контрагентов</p>
          </div>
        ) : (
          enriched.map((c, i) => (
            <div
              key={c.id}
              className={cn(
                'group grid grid-cols-[1fr_auto_auto_auto_auto] items-center px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer',
                i < enriched.length - 1 && 'border-b border-slate-50',
              )}
              onClick={() => router.push(`/clients/${c.id}`)}
            >
              {/* Name + INN */}
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn(
                  'h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold',
                  c.color,
                )}>
                  {c.initials}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                    {c.unread > 0 && (
                      <span className="h-4 min-w-[16px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1 flex-shrink-0">
                        {c.unread}
                      </span>
                    )}
                    {c.unprocessed > 0 && (
                      <span className="h-4 min-w-[16px] rounded-full bg-amber-400 text-white text-[9px] font-bold flex items-center justify-center px-1 flex-shrink-0">
                        !
                      </span>
                    )}
                  </div>
                  {c.inn && (
                    <p className="text-[11px] text-muted-foreground leading-none mt-0.5">ИНН {c.inn}</p>
                  )}
                </div>
              </div>

              {/* Channel badges */}
              <div className="w-28 flex items-center justify-center gap-1">
                {c.activeChannels.map((ch) => (
                  <span
                    key={ch}
                    className="inline-flex items-center justify-center h-5 w-5 rounded bg-slate-100 text-slate-500"
                    title={ch}
                  >
                    {CH_ICON[ch]}
                  </span>
                ))}
              </div>

              {/* Last message */}
              <div className="w-24 text-right">
                {c.last ? (
                  <span className="text-[11px] text-muted-foreground">
                    {formatTime(new Date(c.last.timestamp))}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-300">—</span>
                )}
              </div>

              {/* Arrow */}
              <div className="w-6 flex justify-end">
                <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              </div>

              {/* Delete — shown on hover */}
              <div
                className="w-12 flex items-center justify-end pl-1"
                onClick={(e) => e.stopPropagation()}
              >
                {deleteConfirmId === c.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleDelete(c.id, e)}
                      className="text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
                    >
                      Да
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                      className="text-slate-400 text-[10px] px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
                    >
                      Нет
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(c.id); }}
                    title="Удалить клиента"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-400 p-1 rounded hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sync status footer */}
      <div className="flex items-center justify-between px-1 py-1.5 text-[11px] text-muted-foreground">
        <span>
          {lastSync
            ? <>Синхронизировано с 1С: <span className="font-medium text-slate-600">
                {lastSync.toLocaleString('ru-RU', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                })}
              </span></>
            : 'Нет данных из 1С'}
          {syncDone && syncInfo && (
            <span className="ml-2 text-emerald-600 font-medium">{syncInfo}</span>
          )}
        </span>
        <span className="text-slate-300">{clients.length} контрагентов</span>
      </div>
    </div>
  );
}
