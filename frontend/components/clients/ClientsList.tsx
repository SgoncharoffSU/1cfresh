'use client';
import { useMemo, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Plus, MessageSquare, MessageCircle, Zap, FileText, ChevronRight, Trash2 } from 'lucide-react';
import { useClientStore } from '@/store/useClientStore';
import { useChatStore }   from '@/store/useChatStore';
import { Button }         from '@/components/ui/button';
import { TelegramIcon }   from '@/components/icons/TelegramIcon';
import { AiChatIcon }     from '@/components/icons/AiChatIcon';
import { IntegrationKey } from '@/types';
import { cn, formatTime } from '@/lib/utils';
import { ConnectOnecModal } from '@/components/clients/ConnectOnecModal';

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
  const { clients, addClient, addClientRaw, removeClient } = useClientStore();
  const { messages, removeClientMessages }    = useChatStore();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const router = useRouter();
  const { firmId } = useParams<{ firmId: string }>();

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
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowAddModal(true)}>
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
              onClick={() => router.push(`/cli/${firmId}/clients/${c.id}`)}
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

      {showAddModal && (
        <ConnectOnecModal
          clientId={null}
          onClose={() => setShowAddModal(false)}
          onConnected={({ client_id, name, inn }) => {
            addClientRaw({
              id: client_id, name, shortName: name.split(' ').slice(0, 2).join(' '), inn,
              initials: name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
              color: 'bg-blue-100 text-blue-700',
              activeChannels: ['1C'], channelIds: { '1C': client_id },
            });
          }}
          onCreatePlain={(name, inn) => {
            addClient({ name, shortName: name.split(' ').slice(0, 2).join(' '), inn, initials: name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(), activeChannels: [], channelIds: {} });
          }}
        />
      )}
    </div>
  );
}
