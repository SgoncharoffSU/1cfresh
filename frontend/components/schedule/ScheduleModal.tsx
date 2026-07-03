'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  X, Clock, CalendarDays, Calendar, RefreshCw,
  CheckCircle2, Send, MessageSquare, Mail, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { API } from '@/lib/api';
import { ApiDocFull } from '@/components/dashboard/InvoicePanel';
import { TelegramIcon } from '@/components/icons/TelegramIcon';
import { useClientStore } from '@/store/useClientStore';

export interface DocSchedule {
  id:               number;
  tenant_id:        number;
  document_ref_key: string;
  document_number:  string;
  counterparty_key: string;
  counterparty_name: string;
  amount:           number;
  schedule_type:    string;
  schedule_config:  Record<string, unknown>;
  description:      string;
  is_active:        boolean;
  is_posted:        boolean;
  delivery_channel: string | null;
  delivery_address: string | null;
  message:          string | null;
  next_run:         string | null;
  last_run:         string | null;
  run_count:        number;
  error_count:      number;
  last_error:       string | null;
  last_delivery_ok: boolean | null;
  last_delivery_at: string | null;
  created_at:       string;
}

type ScheduleType    = 'interval_minutes' | 'interval_days' | 'monthly_days' | 'weekly_days';
type DeliveryChannel = 'none' | 'TG' | 'EMAIL' | 'INTERNAL' | 'EDO';

interface Props {
  doc:      ApiDocFull;
  clientId: string;
  existing: DocSchedule | null;
  onClose:  () => void;
  onSaved:  (s: DocSchedule) => void;
}

const TYPES: { id: ScheduleType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'interval_minutes', label: 'Каждые N минут',   icon: Clock        },
  { id: 'interval_days',    label: 'Каждые N дней',    icon: RefreshCw    },
  { id: 'monthly_days',     label: 'По числам месяца', icon: CalendarDays },
  { id: 'weekly_days',      label: 'Еженедельно',      icon: Calendar     },
];

const CHANNELS: { id: DeliveryChannel; label: string; icon: React.ReactNode; available: boolean }[] = [
  { id: 'none',     label: 'Не отправлять',   icon: <X className="h-3.5 w-3.5" />,               available: true  },
  { id: 'TG',       label: 'Telegram',         icon: <TelegramIcon className="h-3.5 w-3.5" />,    available: true  },
  { id: 'EMAIL',    label: 'Эл. почта',        icon: <Mail className="h-3.5 w-3.5" />,             available: false },
  { id: 'INTERNAL', label: 'Внутренний чат',   icon: <MessageSquare className="h-3.5 w-3.5" />,   available: false },
  { id: 'EDO',      label: 'ЭДО / Диадок',     icon: <FileText className="h-3.5 w-3.5" />,        available: false },
];

const WD_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function ScheduleModal({ doc, clientId, existing, onClose, onSaved }: Props) {
  const { clients } = useClientStore();

  // Find client linked to this counterparty that has TG channel
  const linkedTgClient = useMemo(() =>
    clients.find((c) =>
      String(c.channelIds['1C']) === String(doc.counterparty.id) &&
      c.channelIds.TG != null,
    ),
    [clients, doc.counterparty.id],
  );

  const [type,    setType]    = useState<ScheduleType>(
    (existing?.schedule_type as ScheduleType) ?? 'interval_days',
  );
  const [minutes, setMinutes] = useState<number>(
    existing?.schedule_type === 'interval_minutes'
      ? (existing.schedule_config.minutes as number) ?? 1
      : 1,
  );
  const [days, setDays] = useState<number>(
    existing?.schedule_type === 'interval_days'
      ? (existing.schedule_config.days as number) ?? 30
      : 30,
  );
  const [monthDays, setMonthDays] = useState<number[]>(
    existing?.schedule_type === 'monthly_days'
      ? (existing.schedule_config.days as number[]) ?? [1]
      : [1],
  );
  const [weekdays, setWeekdays] = useState<number[]>(
    existing?.schedule_type === 'weekly_days'
      ? (existing.schedule_config.weekdays as number[]) ?? [0]
      : [0],
  );

  const [isPosted, setIsPosted] = useState<boolean>(existing?.is_posted ?? true);

  const existingChannel = (existing?.delivery_channel ?? 'none') as DeliveryChannel;
  const [channel,  setChannel]  = useState<DeliveryChannel>(existingChannel);
  // address only needed when TG is selected but no linked client
  const [address,  setAddress]  = useState<string>(existing?.delivery_address ?? '');
  const [message,  setMessage]  = useState<string>(existing?.message ?? '');

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // Whether TG can be sent automatically (client already linked)
  const tgIsAuto = channel === 'TG' && linkedTgClient != null;

  // Recent TG contacts from server (for manual linking)
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

  function buildConfig(): Record<string, unknown> {
    if (type === 'interval_minutes') return { minutes };
    if (type === 'interval_days')    return { days };
    if (type === 'monthly_days')     return { days: monthDays };
    if (type === 'weekly_days')      return { weekdays };
    return {};
  }

  function toggleMonthDay(d: number) {
    setMonthDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );
  }

  function toggleWeekday(d: number) {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );
  }

  async function handleSave() {
    if (type === 'monthly_days' && monthDays.length === 0) {
      setError('Выберите хотя бы одно число месяца'); return;
    }
    if (type === 'weekly_days' && weekdays.length === 0) {
      setError('Выберите хотя бы один день недели'); return;
    }
    // Address required only when TG without auto-link, or other channels
    if (channel !== 'none' && !tgIsAuto && !address.trim()) {
      setError('Укажите адрес отправки'); return;
    }

    // Resolve delivery_address
    let resolvedAddress: string | null = null;
    if (channel !== 'none') {
      resolvedAddress = tgIsAuto
        ? String(linkedTgClient!.channelIds.TG!)
        : address.trim() || null;
    }

    setSaving(true);
    setError('');
    try {
      const body = {
        tenant_id:         1,
        document_ref_key:  doc.id,
        document_number:   doc.number,
        counterparty_key:  doc.counterparty.id,
        counterparty_name: doc.counterparty.name,
        amount:            doc.amount,
        schedule_type:     type,
        schedule_config:   buildConfig(),
        is_posted:         isPosted,
        delivery_channel:  channel === 'none' ? null : channel,
        delivery_address:  resolvedAddress,
        message:           message.trim() || null,
      };
      const url    = existing ? API.docSchedules.update(clientId, existing.id) : API.docSchedules.create(clientId);
      const method = existing ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved: DocSchedule = await res.json();
      onSaved(saved);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70]
                      w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Расписание выставления</h3>
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

          {/* ─── Schedule type ─── */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Периодичность
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setType(id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-xs font-medium transition-all',
                    type === id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-2">
              {type === 'interval_minutes' && (
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} value={minutes}
                    onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
                    className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-muted-foreground">
                    {minutes === 1 ? 'Каждую минуту' : `Каждые ${minutes} минут`}
                  </span>
                  {minutes <= 5 && (
                    <span className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1">Тест</span>
                  )}
                </div>
              )}

              {type === 'interval_days' && (
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} value={days}
                    onChange={(e) => setDays(Math.max(1, Number(e.target.value)))}
                    className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-muted-foreground">
                    {days === 1 ? 'Каждый день' : `Каждые ${days} дней`}
                  </span>
                </div>
              )}

              {type === 'monthly_days' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <button
                        key={d}
                        onClick={() => toggleMonthDay(d)}
                        className={cn(
                          'h-8 w-8 rounded-lg text-xs font-medium transition-all',
                          monthDays.includes(d)
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  {monthDays.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">Числа: {monthDays.join(', ')}</p>
                  )}
                </div>
              )}

              {type === 'weekly_days' && (
                <div className="flex gap-1.5">
                  {WD_LABELS.map((label, i) => (
                    <button
                      key={i}
                      onClick={() => toggleWeekday(i)}
                      className={cn(
                        'flex-1 h-9 rounded-lg text-xs font-medium transition-all',
                        weekdays.includes(i)
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ─── 1C document options ─── */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Документ в 1С
            </label>
            <button
              onClick={() => setIsPosted((v) => !v)}
              className={cn(
                'flex items-center gap-3 w-full px-4 py-3 rounded-xl border text-left transition-all',
                isPosted ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <div className={cn(
                'h-5 w-5 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-all',
                isPosted ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300',
              )}>
                {isPosted && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
              </div>
              <div>
                <p className={cn('text-sm font-medium', isPosted ? 'text-emerald-700' : 'text-slate-700')}>
                  {isPosted ? 'Проводить документ' : 'Не проводить документ'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {isPosted
                    ? 'Счёт будет создан и проведён (Posted=true) в 1С'
                    : 'Счёт создаётся как черновик — вы проводите его вручную'}
                </p>
              </div>
            </button>
          </div>

          {/* ─── Delivery channel ─── */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Отправить клиенту после создания
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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

            {/* TG: auto mode (client already linked) */}
            {channel === 'TG' && tgIsAuto && (
              <div className="mt-2 flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-sky-50 border border-sky-200">
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

            {/* TG: manual linking (no linked client) */}
            {channel === 'TG' && !tgIsAuto && (
              <div className="mt-2 space-y-2">
                {/* Recent TG contacts from server */}
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

                {/* Manual input */}
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
                    Нет входящих из Telegram. Попросите клиента написать в бот — он появится в Чатах, где можно прикрепить.
                  </p>
                )}
              </div>
            )}

            {/* Other channels address */}
            {channel !== 'none' && channel !== 'TG' && (
              <div className="mt-2 space-y-1">
                <label className="text-[11px] text-muted-foreground">
                  {channel === 'EMAIL'    ? 'Email адрес получателя' : ''}
                  {channel === 'INTERNAL' ? 'Внутренний ID пользователя' : ''}
                  {channel === 'EDO'      ? 'Идентификатор ящика ЭДО' : ''}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={channel === 'EMAIL' ? 'client@example.com' : ''}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* ─── Message ─── */}
          {channel !== 'none' && (
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
                placeholder="Текст отправится клиенту вместе со счётом. Например: «Добрый день! Направляем счёт на оплату.»"
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
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
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Сохранение…' : existing ? 'Сохранить' : 'Создать расписание'}
          </button>
        </div>
      </div>
    </>
  );
}
