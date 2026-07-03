'use client';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import {
  ArrowLeft, MessageSquare, CheckSquare, FileText, Zap, ScrollText,
  MessageCircle, CheckCircle2, XCircle, Circle, Mail, RefreshCw, CalendarClock,
  Pencil, Trash2, ToggleLeft, ToggleRight, Globe, Eye, EyeOff, Copy, ExternalLink,
} from 'lucide-react';
import { ChatView, Group } from '@/components/chat/ChatCRM';
import { InvoicePanel, ApiDocFull } from '@/components/dashboard/InvoicePanel';
import { ScheduleModal, DocSchedule } from '@/components/schedule/ScheduleModal';
import { useClientStore } from '@/store/useClientStore';
import { useChatStore }   from '@/store/useChatStore';
import { useTaskStore }   from '@/store/useTaskStore';
import { useAppStore }    from '@/store/useAppStore';
import { Input }          from '@/components/ui/input';
import { Button }         from '@/components/ui/button';
import { Textarea }       from '@/components/ui/textarea';
import { TelegramIcon }   from '@/components/icons/TelegramIcon';
import { AiChatIcon }     from '@/components/icons/AiChatIcon';
import { ChatMessage, IntegrationKey } from '@/types';
import { API, apiFetch } from '@/lib/api';
import ContractsTab      from '@/components/clients/ContractsTab';
import { ConnectOnecModal } from '@/components/clients/ConnectOnecModal';
import { cn, formatTime, formatDate } from '@/lib/utils';

// ─── Channel badge ─────────────────────────────────────────────────────────────
type ChCfg = { icon: React.ReactNode; cls: string };
const CH: Record<IntegrationKey, ChCfg> = {
  TG:            { icon:<TelegramIcon className="h-3 w-3" />,  cls:'bg-sky-100 text-sky-600'      },
  VK:            { icon:<MessageCircle className="h-3 w-3" />, cls:'bg-indigo-100 text-indigo-600' },
  INTERNAL_CHAT: { icon:<MessageSquare className="h-3 w-3" />, cls:'bg-violet-100 text-violet-600' },
  MAX:           { icon:<Zap className="h-3 w-3" />,           cls:'bg-amber-100 text-amber-600'   },
  '1C':          { icon:<span className="text-[9px] font-bold">1С</span>, cls:'bg-red-100 text-red-600' },
  MOYSKLAD:      { icon:<span className="text-[9px] font-bold">МС</span>, cls:'bg-emerald-100 text-emerald-600' },
  B24:           { icon:<span className="text-[9px] font-bold">B</span>,  cls:'bg-orange-100 text-orange-600' },
  DIADOC:        { icon:<FileText className="h-3 w-3" />,      cls:'bg-teal-100 text-teal-600'    },
  PORTAL:        { icon:<AiChatIcon className="h-3 w-3" />,    cls:'bg-purple-100 text-purple-600' },
};
function ChBadge({ ch }: { ch: IntegrationKey }) {
  const cfg = CH[ch] ?? CH.INTERNAL_CHAT;
  return <span className={cn('inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium', cfg.cls)}>{cfg.icon}</span>;
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'chat' | 'tasks' | 'docs' | 'schedules' | 'integrations' | 'portal';
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id:'chat',         label:'Чат',          icon:MessageSquare  },
  { id:'tasks',        label:'Задачи',       icon:CheckSquare    },
  { id:'docs',         label:'Документы',    icon:FileText       },
  { id:'schedules',    label:'Расписания',   icon:CalendarClock  },
  { id:'integrations', label:'Интеграции',   icon:Zap            },
  { id:'portal',       label:'Портал',       icon:Globe          },
];

// ─── Chat tab — reuses the same ChatView as the Чаты page ─────────────────────
function ChatTab({ clientId }: { clientId: string }) {
  const { messages, markDone } = useChatStore();
  const { clients }            = useClientStore();

  const client = clients.find((c) => c.id === clientId);

  const clientMsgs = useMemo(
    () => messages.filter((m) => m.clientId === clientId),
    [messages, clientId],
  );

  if (!client) return null;

  const unprocessed = clientMsgs.filter((m) => !m.done && m.senderId !== 'u1');
  const oldestTs    = unprocessed.length > 0
    ? Math.min(...unprocessed.map((m) => new Date(m.timestamp).getTime()))
    : null;

  const group: Group = { client, msgs: clientMsgs, unprocessed, oldestTs };
  return <ChatView group={group} onMarkDone={markDone} />;
}

// ─── Tasks tab ─────────────────────────────────────────────────────────────────
const PRIO_C: Record<string, string> = {
  URGENT:'bg-red-100 text-red-700', HIGH:'bg-orange-100 text-orange-700',
  MEDIUM:'bg-yellow-100 text-yellow-700', LOW:'bg-slate-100 text-slate-600',
};
const PRIO_L: Record<string, string> = { URGENT:'Срочно', HIGH:'Высокий', MEDIUM:'Средний', LOW:'Низкий' };

function TasksTab({ clientId }: { clientId: string }) {
  const { tasks, updateTask } = useTaskStore();
  const clientTasks = tasks.filter((t) => t.clientId === clientId);

  if (clientTasks.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 gap-2 text-muted-foreground">
        <CheckSquare className="h-10 w-10 text-slate-100" />
        <p className="text-sm">Нет задач для этого клиента</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2 overflow-y-auto h-full">
      {clientTasks.map((task) => (
        <div key={task.id} className={cn(
          'bg-white rounded-lg border border-slate-100 p-3 flex items-start gap-3',
          task.status === 'DONE' && 'opacity-60',
        )}>
          <button
            onClick={() => updateTask(task.id, { status: task.status === 'DONE' ? 'TODO' : 'DONE' })}
            className={cn(
              'mt-0.5 h-5 w-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all',
              task.status === 'DONE' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400',
            )}
          >
            {task.status === 'DONE' && <span className="text-[10px] font-bold leading-none">✓</span>}
          </button>
          <div className="flex-1 min-w-0">
            <p className={cn('text-sm font-medium', task.status === 'DONE' && 'line-through text-slate-400')}>
              {task.title}
            </p>
            {task.dueDate && (
              <p className="text-[10px] text-muted-foreground mt-0.5">Срок: {formatDate(task.dueDate)}</p>
            )}
          </div>
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0', PRIO_C[task.priority] ?? PRIO_C.MEDIUM)}>
            {PRIO_L[task.priority]}
          </span>
        </div>
      ))}
    </div>
  );
}


// ─── Channel icons for documents ───────────────────────────────────────────────
const DOC_CHANNEL_ICON: Record<string, React.ReactNode> = {
  TG:    <TelegramIcon className="h-3 w-3" />,
  EMAIL: <Mail className="h-3 w-3" />,
};

// ─── Documents sub-tabs ────────────────────────────────────────────────────────
type DocSubTab = 'contracts' | 'invoices' | 'sales' | 'factura';
const DOC_SUB_TABS: { id: DocSubTab; label: string; type: string }[] = [
  { id: 'contracts', label: 'Договоры',      type: 'CONTRACT' },
  { id: 'invoices',  label: 'Счета',         type: 'INVOICE'  },
  { id: 'sales',     label: 'Реализации',    type: 'SALE'     },
  { id: 'factura',   label: 'Счета-фактуры', type: 'FACTURA'  },
];

// ─── Inline schedule panel for a document ──────────────────────────────────────
const WEEK_NAMES = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function DocSchedulePanel({
  doc,
  clientId,
  onClose,
}: {
  doc: ApiDocFull;
  clientId: string;
  onClose: () => void;
}) {
  const [freq,    setFreq]    = useState<'weekly'|'monthly'|'quarterly'|'minutes'>('monthly');
  const [weekDay, setWeekDay] = useState(5);  // для minutes — интервал в минутах
  const [monthDay,setMonthDay]= useState('1');
  const [channel, setChannel] = useState('');
  const [address, setAddress] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState('');

  const basisType = (doc as any).type as string;  // INVOICE | SALE | FACTURA
  const targetMap: Record<string, string> = { INVOICE:'INVOICE', SALE:'SALE', FACTURA:'FACTURA' };
  const target = targetMap[basisType] || 'INVOICE';

  useEffect(() => {
    // load existing schedule if any
    apiFetch(API.contracts.listSchedules(clientId, doc.id))
      .then(r => r.ok ? r.json() : [])
      .then((schedules: any[]) => {
        const s = schedules.find((x: any) => x.doc_type_target === target);
        if (s) {
          setFreq(s.frequency);
          setWeekDay(s.week_day ?? 0);
          setMonthDay(s.month_day ?? '1');
          setChannel(s.delivery_channel ?? '');
          setAddress(s.delivery_address ?? '');
        }
      })
      .catch(() => {});
  }, [clientId, doc.id, target]);

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      const body: Record<string, unknown> = {
        frequency: freq,
        month_day: monthDay,
        create_invoice: target === 'INVOICE',
        create_sale: target === 'SALE',
        create_factura: target === 'FACTURA',
        delivery_channel: channel || null,
        delivery_address: address || null,
        is_active: true,
        basis_doc_type: basisType,
        doc_type_target: target,
      };
      if (freq === 'weekly' || freq === 'minutes') body.week_day = weekDay;
      const r = await apiFetch(API.contracts.upsertSchedule(clientId, doc.id, target, basisType), {
        method: 'POST', body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      setMsg('Расписание сохранено');
      setTimeout(onClose, 1200);
    } catch (e: unknown) {
      setMsg('Ошибка: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setSaving(false); }
  }

  async function del() {
    if (!confirm('Удалить расписание?')) return;
    await apiFetch(API.contracts.deleteSchedule(clientId, doc.id, target), { method: 'DELETE' });
    onClose();
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-blue-900 text-xs">Расписание создания: {doc.number}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-base leading-none">×</button>
      </div>

      {/* Frequency */}
      <div className="flex gap-1.5 flex-wrap">
        {([
          ['monthly',   'Ежемесячно'],
          ['weekly',    'Еженедельно'],
          ['quarterly', 'Ежеквартально'],
          ['minutes',   '⏱ Мин'],
        ] as ['weekly'|'monthly'|'quarterly'|'minutes', string][]).map(([f,label]) => (
          <button key={f} onClick={() => setFreq(f)}
            className={cn('px-2 py-0.5 rounded text-xs border', freq === f
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-300')}>
            {label}
          </button>
        ))}
      </div>

      {/* Day / interval picker */}
      {freq === 'minutes' ? (
        <div className="flex gap-1 items-center flex-wrap">
          <span className="text-xs text-slate-500">Каждые:</span>
          {[1,2,5,10,15,30,60].map(m => (
            <button key={m} onClick={() => setWeekDay(m)}
              className={cn('px-2 py-0.5 rounded text-xs border', weekDay===m
                ?'bg-orange-500 text-white border-orange-500'
                :'bg-white text-slate-600 border-slate-300')}>
              {m} мин
            </button>
          ))}
        </div>
      ) : freq === 'weekly' ? (
        <div className="flex gap-1">
          {WEEK_NAMES.map((d,i) => (
            <button key={i} onClick={() => setWeekDay(i)}
              className={cn('w-7 h-7 rounded text-xs border', weekDay===i
                ?'bg-blue-600 text-white border-blue-600'
                :'bg-white text-slate-600 border-slate-300')}>
              {d}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-1 flex-wrap items-center">
          <span className="text-xs text-slate-500">Число:</span>
          {['first','1','5','10','15','20','25','last'].map(v => (
            <button key={v} onClick={() => setMonthDay(v)}
              className={cn('min-w-[26px] h-6 px-1 rounded text-xs border', monthDay===v
                ?'bg-blue-600 text-white border-blue-600'
                :'bg-white text-slate-600 border-slate-300')}>
              {v==='first'?'Нач':v==='last'?'Кон':v}
            </button>
          ))}
        </div>
      )}

      {/* Delivery */}
      <div className="flex gap-1.5 flex-wrap items-center">
        <span className="text-xs text-slate-500">Отправить:</span>
        {(['','EMAIL','TG'] as const).map(ch => (
          <button key={ch} onClick={() => setChannel(ch)}
            className={cn('px-2 py-0.5 rounded text-xs border flex items-center gap-1', channel===ch
              ?'bg-blue-600 text-white border-blue-600'
              :'bg-white text-slate-600 border-slate-300')}>
            {ch === 'EMAIL' ? <Mail className="h-3.5 w-3.5" /> : ch === 'TG' ? <TelegramIcon className="h-3.5 w-3.5" /> : 'Нет'}
          </button>
        ))}
        {channel && (
          <input value={address} onChange={e => setAddress(e.target.value)}
            className="flex-1 border rounded px-2 py-0.5 text-xs min-w-[140px]"
            placeholder={channel==='TG'?'chat_id / @username':'email@example.com'} />
        )}
      </div>

      <div className="flex gap-2 items-center">
        <button onClick={save} disabled={saving}
          className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        <button onClick={del} className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200">
          Удалить
        </button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

const POLL_INTERVAL = 30_000; // 30 sec background refresh

// ─── Documents tab ─────────────────────────────────────────────────────────────
function DocsTab({ clientId }: { clientId: string }) {
  const [docs,        setDocs]        = useState<ApiDocFull[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState<ApiDocFull | null>(null);
  const [subTab,      setSubTab]      = useState<DocSubTab>('invoices');
  const [scheduling,  setScheduling]  = useState<ApiDocFull | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [newIds,      setNewIds]      = useState<Set<string>>(new Set());

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Server already scopes documents to this client's own 1C connection —
      // no more client-side counterparty filtering needed (each client has
      // their own 1C base now, so every returned doc is inherently theirs).
      const res = await apiFetch(API.documents.list(clientId));
      if (res.ok) {
        const all: ApiDocFull[] = await res.json();
        if (silent) {
          setDocs(prev => {
            const prevIds = new Set(prev.map(d => d.id));
            const fresh = all.filter(d => !prevIds.has(d.id));
            if (fresh.length > 0) {
              setNewIds(ids => new Set(Array.from(ids).concat(fresh.map(d => d.id))));
              setTimeout(() => setNewIds(ids => {
                const next = new Set(Array.from(ids));
                fresh.forEach(d => next.delete(d.id));
                return next;
              }), 2500);
            }
            return all;
          });
        } else {
          setDocs(all);
        }
        setLastUpdated(new Date());
      }
    } catch {}
    if (!silent) setLoading(false);
  }, [clientId]);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => {
    const sub = DOC_SUB_TABS.find((s) => s.id === subTab);
    return sub ? docs.filter((d) => d.type === sub.type) : docs;
  }, [docs, subTab]);

  const total = useMemo(() => filtered.reduce((s, d) => s + d.amount, 0), [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-xs text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Загрузка…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex border-b border-slate-100 bg-white px-4 flex-shrink-0">
        {DOC_SUB_TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
              subTab === id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'contracts' ? (
        <div className="flex-1 overflow-auto p-4">
          <ContractsTab clientId={clientId} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-xs text-muted-foreground">
          <FileText className="h-10 w-10 text-slate-100" />
          <p>Нет документов</p>
          <button onClick={() => load()} className="text-blue-500 hover:text-blue-700 underline">Обновить</button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Номер</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Дата</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Статус</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Сумма</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((doc) => (
                  <>
                  <tr
                    key={doc.id}
                    onClick={() => setSelected(doc)}
                    className={cn(
                      'cursor-pointer transition-colors',
                      newIds.has(doc.id)
                        ? 'bg-blue-50 hover:bg-blue-100 animate-pulse'
                        : 'hover:bg-slate-50',
                    )}
                  >
                    <td className={cn('px-4 py-3 font-mono font-medium', doc.deletion_mark ? 'line-through text-slate-400' : 'text-slate-800')}>{doc.number}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {doc.date
                        ? new Date(doc.date).toLocaleString('ru-RU', {
                            day:'2-digit', month:'2-digit', year:'numeric',
                            hour:'2-digit', minute:'2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {doc.deletion_mark && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-600">
                            <Trash2 className="h-3 w-3" /> На удаление
                          </span>
                        )}
                        {!doc.deletion_mark && (doc.is_posted ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" /> Проведён
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500">
                            <Circle className="h-3 w-3" /> Не проведён
                          </span>
                        ))}
                        {doc.sent_via && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-700">
                            {DOC_CHANNEL_ICON[doc.sent_via] ?? null} Отправлен
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                      {doc.amount.toLocaleString('ru-RU', { minimumFractionDigits: 0 })} ₽
                    </td>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setScheduling(scheduling?.id === doc.id ? null : doc)}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors',
                          scheduling?.id === doc.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600'
                        )}
                        title="Создать по расписанию"
                      >
                        <CalendarClock className="h-3 w-3" />
                        Расписание
                      </button>
                    </td>
                  </tr>
                  {scheduling?.id === doc.id && (
                    <tr key={doc.id + '-sched'}>
                      <td colSpan={5} className="px-4 py-2">
                        <DocSchedulePanel
                          doc={doc}
                          clientId={clientId}
                          onClose={() => setScheduling(null)}
                        />
                      </td>
                    </tr>
                  )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex-shrink-0 border-t border-slate-100 px-4 py-2.5 flex justify-between items-center bg-slate-50">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{filtered.length} {filtered.length === 1 ? 'документ' : 'документов'}</span>
              {lastUpdated && (
                <span className="text-[11px] text-slate-400">
                  обновлено {lastUpdated.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-slate-800">
              Итого: {total.toLocaleString('ru-RU')} ₽
            </span>
          </div>
        </>
      )}

      <InvoicePanel doc={selected} clientId={clientId} onClose={() => setSelected(null)} />
    </div>
  );
}

// ─── Schedules tab ─────────────────────────────────────────────────────────────
function SchedulesTab({ clientId }: { clientId: string }) {
  const [schedules, setSchedules] = useState<DocSchedule[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [editing,   setEditing]   = useState<DocSchedule | null>(null);
  const [editDoc,   setEditDoc]   = useState<ApiDocFull | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API.docSchedules.list(clientId));
      if (res.ok) setSchedules(await res.json());
    } catch {}
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(id: number) {
    const res = await fetch(API.docSchedules.toggle(clientId, id), { method: 'PATCH' });
    if (res.ok) {
      const updated: DocSchedule = await res.json();
      setSchedules((prev) => prev.map((s) => s.id === id ? updated : s));
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Удалить расписание?')) return;
    await fetch(API.docSchedules.delete(clientId, id), { method: 'DELETE' });
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  function handleEdit(s: DocSchedule) {
    setEditing(s);
    setEditDoc({
      id:           s.document_ref_key,
      type:         'INVOICE',
      number:       s.document_number,
      date:         null,
      amount:       s.amount,
      currency:     'RUB',
      status:       'SENT',
      is_posted:     s.is_posted,
      deletion_mark: false,
      sent_via:      null,
      counterparty: { id: s.counterparty_key, name: s.counterparty_name, inn: '' },
      synced_at:    s.created_at,
      items:        [],
      comment:      '',
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-xs text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Загрузка…</span>
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-xs text-muted-foreground">
        <CalendarClock className="h-10 w-10 text-slate-100" />
        <p>Нет расписаний</p>
        <p className="text-center max-w-xs text-[11px]">
          Откройте документ в вкладке «Документы» и нажмите «Выставлять по расписанию»
        </p>
      </div>
    );
  }

  function fmtDt(dt: string | null) {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Документ</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Расписание</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Следующий</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Последний</th>
              <th className="text-center px-2 py-2.5 font-medium text-muted-foreground">Кол.</th>
              <th className="text-center px-2 py-2.5 font-medium text-muted-foreground w-24">Отправлено</th>
              <th className="text-center px-2 py-2.5 font-medium text-muted-foreground w-20">Вкл</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {schedules.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-mono font-medium text-slate-800">№{s.document_number}</td>
                <td className="px-3 py-3 text-slate-700">{s.description}</td>
                <td className="px-3 py-3 text-muted-foreground">{fmtDt(s.next_run)}</td>
                <td className="px-3 py-3 text-muted-foreground">{fmtDt(s.last_run)}</td>
                <td className="px-2 py-3 text-center font-semibold text-slate-700">{s.run_count}</td>
                <td className="px-2 py-3 text-center">
                  {s.delivery_channel ? (
                    <span
                      title={
                        s.last_delivery_ok === true  ? `Отправлено ${fmtDt(s.last_delivery_at)}` :
                        s.last_delivery_ok === false ? `Ошибка ${fmtDt(s.last_delivery_at)}` :
                        s.delivery_channel
                      }
                      className={cn(
                        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium',
                        s.last_delivery_ok === true  ? 'bg-emerald-50 text-emerald-700' :
                        s.last_delivery_ok === false ? 'bg-red-50 text-red-500' :
                        'bg-slate-100 text-slate-400',
                      )}
                    >
                      {DOC_CHANNEL_ICON[s.delivery_channel] ?? null}
                      {s.last_delivery_ok === true ? 'OK' : s.last_delivery_ok === false ? '!' : '—'}
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-3 text-center">
                  <button onClick={() => handleToggle(s.id)} className="transition-colors">
                    {s.is_active
                      ? <ToggleRight className="h-5 w-5 text-blue-600 mx-auto" />
                      : <ToggleLeft  className="h-5 w-5 text-slate-300 mx-auto" />}
                  </button>
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(s)}
                      className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                      title="Редактировать"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                      title="Удалить"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex-shrink-0 border-t border-slate-100 px-4 py-2.5 bg-slate-50">
        <span className="text-xs text-muted-foreground">{schedules.length} {schedules.length === 1 ? 'правило' : 'правил'}</span>
      </div>

      {editing && editDoc && (
        <ScheduleModal
          doc={editDoc}
          clientId={clientId}
          existing={editing}
          onClose={() => { setEditing(null); setEditDoc(null); }}
          onSaved={(updated) => {
            setSchedules((prev) => prev.map((s) => s.id === updated.id ? updated : s));
            setEditing(null);
            setEditDoc(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Integrations tab ──────────────────────────────────────────────────────────
const INT_LIST: { key: IntegrationKey; label: string; desc: string }[] = [
  { key:'TG',            label:'Telegram',       desc:'Мессенджер для общения с клиентом' },
  { key:'VK',            label:'ВКонтакте',      desc:'Сообщения через VK' },
  { key:'INTERNAL_CHAT', label:'Внутренний чат', desc:'Чат внутри системы' },
  { key:'1C',            label:'1С:Предприятие', desc:'Синхронизация документов из 1С' },
  { key:'DIADOC',        label:'Диадок',         desc:'Электронный документооборот' },
  { key:'MOYSKLAD',      label:'МойСклад',       desc:'Управление товарами и остатками' },
];

function IntegrationsTab({ clientId, clientName, activeChannels }: { clientId: string; clientName: string; activeChannels: IntegrationKey[] }) {
  const { markChannelConnected } = useClientStore();
  const [connecting1c, setConnecting1c] = useState(false);

  return (
    <div className="p-4 space-y-2 overflow-y-auto h-full">
      {INT_LIST.map(({ key, label, desc }) => {
        const connected = activeChannels.includes(key);
        const cfg = CH[key];
        return (
          <div key={key} className="bg-white rounded-lg border border-slate-100 p-3 flex items-center gap-3">
            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0', connected ? 'bg-emerald-50' : 'bg-slate-50')}>
              {cfg?.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">{label}</p>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-slate-300')} />
              <span className={cn('text-xs', connected ? 'text-emerald-700 font-medium' : 'text-slate-400')}>
                {connected ? 'Подключён' : 'Не подключён'}
              </span>
              {key === '1C' && !connected && (
                <Button size="sm" variant="outline" className="h-7 text-xs px-2 ml-1" onClick={() => setConnecting1c(true)}>Подключить</Button>
              )}
              {key === '1C' && connected && (
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2 ml-1 text-slate-500" onClick={() => setConnecting1c(true)}>Настроить</Button>
              )}
            </div>
          </div>
        );
      })}

      {connecting1c && (
        <ConnectOnecModal
          clientId={clientId}
          initialName={clientName}
          onClose={() => setConnecting1c(false)}
          onConnected={(result) => {
            if (result.connected) markChannelConnected(clientId, '1C', result.client_id);
          }}
        />
      )}
    </div>
  );
}

// ─── Portal tab ────────────────────────────────────────────────────────────────
function PortalTab({ clientId }: { clientId: string }) {
  const { firmId } = useParams<{ firmId: string }>();
  const { clients } = useClientStore();
  const client = clients.find((c) => c.id === clientId);

  const [login,       setLogin]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState('');
  const [existingLogin, setExistingLogin] = useState<string | null>(null);

  // Load existing login from server on mount
  useEffect(() => {
    apiFetch(API.portal.credentials(clientId))
      .then((r) => r.ok ? r.json() : { exists: false })
      .then((d) => { if (d.exists) setExistingLogin(d.login); })
      .catch(() => {});
  }, [clientId]);

  const handleSave = async () => {
    if (!login.trim() || !password.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(API.portal.setCredentials(), {
        method: 'POST',
        body:   JSON.stringify({
          client_id:   clientId,
          client_name: client?.name ?? clientId,
          login:       login.trim(),
          password:    password.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail ?? 'Ошибка сохранения');
        return;
      }
      setExistingLogin(login.trim().toLowerCase());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Ошибка соединения с сервером');
    } finally {
      setSaving(false);
    }
  };

  const portalPath = `/cli/${firmId}/login`;
  const portalUrl  = typeof window !== 'undefined' ? `${window.location.origin}${portalPath}` : portalPath;

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full max-w-lg">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Доступ клиента к порталу</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Клиент сможет войти на портал и просматривать историю переписки, задачи и документы.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <Globe className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-blue-800">Ссылка на портал</p>
          <p className="text-xs text-blue-600 truncate mt-0.5">{portalUrl}</p>
        </div>
        <a href={portalUrl} target="_blank" rel="noreferrer"
          className="flex-shrink-0 p-1.5 rounded-lg hover:bg-blue-100 text-blue-500 transition-colors">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {existingLogin && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-xs text-emerald-700 space-y-1">
          <p className="font-medium">Доступ настроен</p>
          <p>Логин: <span className="font-mono font-semibold">{existingLogin}</span></p>
          <p>Клиент может войти по ссылке выше. Ниже можно изменить пароль.</p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-700">
          {existingLogin ? 'Изменить учётные данные' : 'Задать учётные данные'}
        </p>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Логин</label>
          <div className="flex gap-2">
            <Input value={login} onChange={(e) => setLogin(e.target.value)}
              placeholder={existingLogin ?? 'например: ivanov'} className="h-9 text-sm flex-1" />
            {login && (
              <button type="button"
                onClick={() => navigator.clipboard.writeText(login)}
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                title="Скопировать">
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Пароль</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Придумайте пароль"
                className="h-9 text-sm pr-9"
              />
              <button type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {password && (
              <button type="button"
                onClick={() => navigator.clipboard.writeText(password)}
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                title="Скопировать">
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button size="sm" onClick={handleSave} disabled={!login.trim() || !password.trim() || saving}>
          {saving ? 'Сохранение…' : saved ? '✓ Сохранено' : 'Сохранить доступ'}
        </Button>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export function ClientDetail({ clientId }: { clientId: string }) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { firmId }   = useParams<{ firmId: string }>();
  const clientsHref  = `/cli/${firmId}/clients`;

  // Tab state lives in URL — survives page refresh
  const activeTab  = (searchParams.get('tab') as Tab | null) ?? 'chat';
  const setActiveTab = (tab: Tab) => router.replace(`${clientsHref}/${clientId}?tab=${tab}`);

  const { clients } = useClientStore();
  const client = clients.find((c) => c.id === clientId);

  if (!client) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Клиент не найден</p>
          <Link href={clientsHref} className="text-xs text-blue-600 hover:underline mt-2 block">← Список клиентов</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 pt-4 flex-shrink-0">
        <Link href={clientsHref} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-slate-700 mb-3">
          <ArrowLeft className="h-3 w-3" />
          Все клиенты
        </Link>
        <div className="flex items-center gap-3 mb-4">
          <div className={cn('h-11 w-11 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0', client.color)}>
            {client.initials}
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">{client.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {client.inn && <span className="text-[11px] text-muted-foreground">ИНН {client.inn}</span>}
              {client.activeChannels.map((ch) => <ChBadge key={ch} ch={ch} />)}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex -mb-px">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat'         && <ChatTab clientId={clientId} />}
        {activeTab === 'tasks'        && <TasksTab clientId={clientId} />}
        {activeTab === 'docs'         && <DocsTab clientId={clientId} />}
        {activeTab === 'schedules'    && <SchedulesTab clientId={clientId} />}
        {activeTab === 'integrations' && <IntegrationsTab clientId={clientId} clientName={client.name} activeChannels={client.activeChannels} />}
        {activeTab === 'portal'       && <PortalTab clientId={clientId} />}
      </div>
    </div>
  );
}
