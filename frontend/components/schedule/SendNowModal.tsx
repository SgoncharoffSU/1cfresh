'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, CheckCircle2, Send, MessageSquare, Mail, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API } from '@/lib/api';
import { ApiDocFull } from '@/components/dashboard/InvoicePanel';
import { TelegramIcon } from '@/components/icons/TelegramIcon';
import { useClientStore } from '@/store/useClientStore';

type DeliveryChannel = 'TG' | 'EMAIL' | 'INTERNAL' | 'EDO';

const CHANNELS: { id: DeliveryChannel; label: string; icon: React.ReactNode; available: boolean }[] = [
  { id: 'TG',       label: 'Telegram',       icon: <TelegramIcon className="h-3.5 w-3.5" />,    available: true  },
  { id: 'EMAIL',    label: 'Эл. почта',      icon: <Mail className="h-3.5 w-3.5" />,             available: false },
  { id: 'INTERNAL', label: 'Внутренний чат', icon: <MessageSquare className="h-3.5 w-3.5" />,   available: false },
  { id: 'EDO',      label: 'ЭДО / Диадок',   icon: <FileText className="h-3.5 w-3.5" />,        available: false },
];

interface Props {
  doc:     ApiDocFull;
  onClose: () => void;
  onSent:  () => void;
}

export function SendNowModal({ doc, onClose, onSent }: Props) {
  const { clients } = useClientStore();

  const linkedTgClient = useMemo(() =>
    clients.find((c) =>
      String(c.channelIds['1C']) === String(doc.counterparty.id) &&
      c.channelIds.TG != null,
    ),
    [clients, doc.counterparty.id],
  );

  const [channel,  setChannel]  = useState<DeliveryChannel>('TG');
  const [address,  setAddress]  = useState('');
  const [message,  setMessage]  = useState('');
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  const tgIsAuto = channel === 'TG' && linkedTgClient != null;

  interface RecentChat { chat_id: number; sender_name: string; username: string }
  const [recentTg,      setRecentTg]      = useState<RecentChat[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  useEffect(() => {
    if (channel !== 'TG' || tgIsAuto) { setRecentTg([]); return; }
    setLoadingRecent(true);
    fetch(API.telegram.recentChats())
      .then((r) => r.ok ? r.json() : { chats: [] })
      .then((d) => setRecentTg(d.chats ?? []))
      .catch(() => setRecentTg([]))
      .finally(() => setLoadingRecent(false));
  }, [channel, tgIsAuto]);

  async function handleSend() {
    if (!tgIsAuto && !address.trim()) {
      setError('Укажите адрес отправки'); return;
    }
    const resolvedAddress = tgIsAuto
      ? String(linkedTgClient!.channelIds.TG!)
      : address.trim();

    setSending(true);
    setError('');
    try {
      const res = await fetch(API.documents.sendNow(doc.id), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenant_id:        1,
          delivery_channel: channel,
          delivery_address: resolvedAddress,
          message:          message.trim() || null,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt);
      }
      setSuccess(true);
      setTimeout(() => { onSent(); onClose(); }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70]
                      w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Отправить сейчас</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Счёт №{doc.number} · {doc.counterparty.name}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">

          {/* Channel */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Способ отправки
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CHANNELS.map(({ id, label, icon, available }) => (
                <button
                  key={id}
                  onClick={() => available && setChannel(id)}
                  disabled={!available}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-xs font-medium transition-all',
                    channel === id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : available
                        ? 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        : 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed',
                  )}
                >
                  {icon}
                  <span>{label}</span>
                  {!available && <span className="ml-auto text-[9px] text-slate-400">скоро</span>}
                </button>
              ))}
            </div>
          </div>

          {/* TG: auto */}
          {channel === 'TG' && tgIsAuto && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-sky-50 border border-sky-200">
              <TelegramIcon className="h-4 w-4 text-sky-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-sky-700">
                  Отправить в Telegram — {linkedTgClient!.shortName}
                </p>
                <p className="text-[11px] text-sky-500 mt-0.5">
                  Chat ID взят из привязанного чата автоматически
                </p>
              </div>
            </div>
          )}

          {/* TG: manual */}
          {channel === 'TG' && !tgIsAuto && (
            <div className="space-y-2">
              {loadingRecent && (
                <p className="text-[11px] text-slate-400 px-1">Загрузка контактов…</p>
              )}
              {!loadingRecent && recentTg.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-slate-500 font-medium">Выберите из последних входящих:</p>
                  {recentTg.map((c) => {
                    const name = c.sender_name || c.username || `TG ${c.chat_id}`;
                    const sel  = address === String(c.chat_id);
                    return (
                      <button
                        key={c.chat_id}
                        type="button"
                        onClick={() => setAddress(String(c.chat_id))}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-all',
                          sel
                            ? 'border-sky-400 bg-sky-50 text-sky-700'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700',
                        )}
                      >
                        <TelegramIcon className="h-3.5 w-3.5 text-sky-400 flex-shrink-0" />
                        <span className="font-medium flex-1 truncate">{name}</span>
                        <span className="text-slate-400 font-mono text-[10px] flex-shrink-0">{c.chat_id}</span>
                        {sel && <CheckCircle2 className="h-3.5 w-3.5 text-sky-500 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">
                  {recentTg.length > 0 ? 'Или введите chat_id вручную:' : 'Telegram chat_id:'}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123456789"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {!loadingRecent && recentTg.length === 0 && (
                <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5">
                  Нет входящих из Telegram. Попросите клиента написать в бот.
                </p>
              )}
            </div>
          )}

          {/* Message */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Send className="h-3 w-3" />
              Сообщение
              <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                — необязательно
              </span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Текст отправится клиенту вместе со счётом."
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          {success && (
            <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Документ отправлен!
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSend}
            disabled={sending || success}
            className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? 'Отправка…' : 'Отправить'}
          </button>
        </div>
      </div>
    </>
  );
}
