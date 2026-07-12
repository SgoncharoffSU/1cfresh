'use client';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import {
  ArrowLeft, MessageSquare, CheckSquare, FileText, Zap, ScrollText,
  MessageCircle, CheckCircle2, XCircle, Circle, Mail, RefreshCw, CalendarClock,
  Pencil, Trash2, ToggleLeft, ToggleRight, Globe, Eye, EyeOff, Copy, ExternalLink,
  Printer, Image as ImageIcon, X,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ChatView, Group } from '@/components/chat/ChatCRM';
import { InvoicePanel, ApiDocFull } from '@/components/dashboard/InvoicePanel';
import { ScheduleModal, DocSchedule } from '@/components/schedule/ScheduleModal';
import { ActPrintModal } from '@/components/schedule/ActPrintModal';
import { BatchPrintModal } from '@/components/schedule/BatchPrintModal';
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
import { API, apiFetch, ClientBrandingOut } from '@/lib/api';
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
type Tab = 'chat' | 'tasks' | 'docs' | 'schedules' | 'integrations' | 'portal' | 'branding';
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id:'chat',         label:'Чат',          icon:MessageSquare  },
  { id:'tasks',        label:'Задачи',       icon:CheckSquare    },
  { id:'docs',         label:'Документы',    icon:FileText       },
  { id:'schedules',    label:'Расписания',   icon:CalendarClock  },
  { id:'integrations', label:'Интеграции',   icon:Zap            },
  { id:'portal',       label:'Портал',       icon:Globe          },
  { id:'branding',     label:'Оформление',   icon:ImageIcon      },
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

// Opens an auth-gated print form in a new tab. These routes require the accountant's
// login (unlike the base invoice form, which is deliberately unauthenticated so it can
// be shared with clients via Telegram) — a plain window.open(url) navigation carries no
// Authorization header and would just 401. Fetch with the token first, then open the
// already-fetched HTML as a blob (same technique ActPrintModal uses for КС-2/КС-3).
async function openAuthedPrintForm(url: string) {
  try {
    const res = await apiFetch(url);
    if (!res.ok) { window.alert('Не удалось сформировать документ'); return; }
    const html = await res.text();
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  } catch {
    window.alert('Ошибка соединения с сервером');
  }
}

// ─── Documents tab ─────────────────────────────────────────────────────────────
function DocsTab({ clientId }: { clientId: string }) {
  const [docs,        setDocs]        = useState<ApiDocFull[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState<ApiDocFull | null>(null);
  const [subTab,      setSubTab]      = useState<DocSubTab>('invoices');
  const [scheduling,  setScheduling]  = useState<ApiDocFull | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [newIds,      setNewIds]      = useState<Set<string>>(new Set());
  const [printingAct, setPrintingAct] = useState<{ doc: ApiDocFull; kind: 'ks2' | 'ks3' } | null>(null);
  const [batchPrintDoc, setBatchPrintDoc] = useState<ApiDocFull | null>(null);
  const [counterpartyFilter, setCounterpartyFilter] = useState('');
  const [sortField, setSortField] = useState<'number' | 'date' | 'counterparty' | 'status' | 'amount' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Server scopes documents to this client's own 1C connection, but that
      // 1C base can itself contain many of the client's own customers
      // (counterparties) — the filter below lets the accountant narrow down
      // to one of them.
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

  const counterparties = useMemo(() => {
    const byId = new Map<string, { name: string; inn: string }>();
    for (const d of docs) {
      if (d.counterparty?.id && !byId.has(d.counterparty.id)) {
        byId.set(d.counterparty.id, {
          // Some counterparties referenced by old documents were later deleted in 1C
          // (a live lookup 404s) — the sync leaves name empty in that case. Never fall
          // back to the raw GUID here, it reads as garbled noise to the accountant.
          name: d.counterparty.name || 'Без названия',
          inn:  d.counterparty.inn || '',
        });
      }
    }
    return Array.from(byId, ([id, v]) => ({ id, ...v })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [docs]);
  const [counterpartySearch, setCounterpartySearch] = useState('');
  const counterpartyMatches = useMemo(() => {
    const q = counterpartySearch.trim().toLowerCase();
    if (!q) return counterparties;
    return counterparties.filter((c) => c.name.toLowerCase().includes(q) || c.inn.includes(q));
  }, [counterparties, counterpartySearch]);
  const selectedCounterparty = counterparties.find((c) => c.id === counterpartyFilter);

  // Basis chain — Счёт → Реализация / Счёт-фактура. `docs` (not `filtered`) so a
  // parent/child on a different sub-tab is still found.
  const docsById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const childrenByBasis = useMemo(() => {
    const map = new Map<string, ApiDocFull[]>();
    for (const d of docs) {
      if (!d.basis_ref_key) continue;
      const list = map.get(d.basis_ref_key) ?? [];
      list.push(d);
      map.set(d.basis_ref_key, list);
    }
    return map;
  }, [docs]);
  const DOC_TYPE_LABEL: Record<string, string> = { INVOICE: 'Счёт', SALE: 'Реализация', FACTURA: 'Счёт-фактура', CONTRACT: 'Договор' };
  function relatedLine(doc: ApiDocFull): string | null {
    const parts: string[] = [];
    const parent = doc.basis_ref_key ? docsById.get(doc.basis_ref_key) : null;
    if (parent) parts.push(`↳ на основании ${DOC_TYPE_LABEL[parent.type] ?? parent.type} №${parent.number}`);
    const children = childrenByBasis.get(doc.id);
    if (children?.length) {
      parts.push(`→ ${children.map((c) => `${DOC_TYPE_LABEL[c.type] ?? c.type} №${c.number}`).join(', ')}`);
    }
    return parts.length ? parts.join(' · ') : null;
  }

  function chainDocsFor(doc: ApiDocFull): ApiDocFull[] {
    const chain = new Map<string, ApiDocFull>([[doc.id, doc]]);
    const parent = doc.basis_ref_key ? docsById.get(doc.basis_ref_key) : null;
    if (parent) chain.set(parent.id, parent);
    for (const c of childrenByBasis.get(doc.id) ?? []) chain.set(c.id, c);
    return Array.from(chain.values());
  }

  const filtered = useMemo(() => {
    const sub = DOC_SUB_TABS.find((s) => s.id === subTab);
    let list = sub ? docs.filter((d) => d.type === sub.type) : docs;
    if (counterpartyFilter) list = list.filter((d) => d.counterparty?.id === counterpartyFilter);
    return list;
  }, [docs, subTab, counterpartyFilter]);

  const total = useMemo(() => filtered.reduce((s, d) => s + d.amount, 0), [filtered]);

  function docStatusLabel(doc: ApiDocFull): string {
    if (doc.deletion_mark) return 'На удаление';
    return doc.is_posted ? 'Проведён' : 'Не проведён';
  }

  const sorted = useMemo(() => {
    if (!sortField) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    const list = [...filtered];
    list.sort((a, b) => {
      switch (sortField) {
        case 'number':
          return dir * a.number.localeCompare(b.number, 'ru');
        case 'counterparty':
          return dir * (a.counterparty?.name || '').localeCompare(b.counterparty?.name || '', 'ru');
        case 'status':
          return dir * docStatusLabel(a).localeCompare(docStatusLabel(b), 'ru');
        case 'amount':
          return dir * (a.amount - b.amount);
        case 'date': {
          const ta = a.date ? new Date(a.date).getTime() : 0;
          const tb = b.date ? new Date(b.date).getTime() : 0;
          return dir * (ta - tb);
        }
        default:
          return 0;
      }
    });
    return list;
  }, [filtered, sortField, sortDir]);

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
      <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 flex-shrink-0">
        <div className="flex">
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
        {counterparties.length > 1 && (
          <div className="relative">
            {selectedCounterparty ? (
              <div className="flex items-center gap-1.5 text-xs border border-blue-200 bg-blue-50 rounded-lg px-2 py-1 text-blue-700 max-w-[240px]">
                <span className="truncate">{selectedCounterparty.name}</span>
                <button
                  type="button"
                  onClick={() => { setCounterpartyFilter(''); setCounterpartySearch(''); }}
                  className="flex-shrink-0 text-blue-400 hover:text-blue-700"
                  title="Сбросить фильтр"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={counterpartySearch}
                  onChange={(e) => setCounterpartySearch(e.target.value)}
                  placeholder="Найти контрагента (название или ИНН)…"
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 w-[240px]"
                />
                {counterpartySearch && (
                  <div className="absolute right-0 top-full mt-1 w-[280px] max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                    {counterpartyMatches.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-400">Ничего не найдено</div>
                    ) : counterpartyMatches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setCounterpartyFilter(c.id); setCounterpartySearch(''); }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex flex-col"
                      >
                        <span className="text-slate-700 truncate">{c.name}</span>
                        {c.inn && <span className="text-[10px] text-slate-400">ИНН {c.inn}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
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
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('number')}>
                    Номер{sortField === 'number' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('date')}>
                    Дата{sortField === 'date' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </th>
                  {counterparties.length > 1 && (
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('counterparty')}>
                      Контрагент{sortField === 'counterparty' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                    </th>
                  )}
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('status')}>
                    Статус{sortField === 'status' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-slate-700" onClick={() => toggleSort('amount')}>
                    Сумма{sortField === 'amount' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map((doc) => (
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
                    <td className={cn('px-4 py-3 font-mono font-medium', doc.deletion_mark ? 'line-through text-slate-400' : 'text-slate-800')}>
                      {doc.number}
                      {relatedLine(doc) && (
                        <div className="font-sans font-normal text-[10px] text-slate-400 normal-case mt-0.5">{relatedLine(doc)}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {doc.date
                        ? new Date(doc.date).toLocaleString('ru-RU', {
                            day:'2-digit', month:'2-digit', year:'numeric',
                            hour:'2-digit', minute:'2-digit',
                          })
                        : '—'}
                    </td>
                    {counterparties.length > 1 && (
                      <td className="px-3 py-3 text-slate-600 max-w-[200px] truncate" title={doc.counterparty?.name}>
                        {doc.counterparty?.name || '—'}
                      </td>
                    )}
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
                      <div className="flex items-center gap-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="inline-flex items-center justify-center h-6 w-6 rounded border border-slate-200 bg-white text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                              title="Печать"
                            >
                              <Printer className="h-3 w-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {doc.type !== 'SALE' && doc.type !== 'FACTURA' && (
                              <DropdownMenuItem onClick={() => window.open(API.documents.print(clientId, doc.id), '_blank')}>
                                Печатная форма
                              </DropdownMenuItem>
                            )}
                            {doc.type === 'SALE' && (
                              <>
                                <DropdownMenuItem onClick={() => openAuthedPrintForm(API.documents.serviceAct(clientId, doc.id))}>
                                  Акт об оказании услуг
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setPrintingAct({ doc, kind: 'ks2' })}>
                                  КС-2 — Акт о приёмке работ
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setPrintingAct({ doc, kind: 'ks3' })}>
                                  КС-3 — Справка о стоимости
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openAuthedPrintForm(API.documents.nakladnaya(clientId, doc.id))}>
                                  Накладная
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openAuthedPrintForm(API.documents.torg12(clientId, doc.id))}>
                                  ТОРГ-12
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openAuthedPrintForm(API.documents.upd(clientId, doc.id))}>
                                  УПД
                                </DropdownMenuItem>
                              </>
                            )}
                            {doc.type === 'FACTURA' && (
                              <DropdownMenuItem onClick={() => openAuthedPrintForm(API.documents.schetFaktura(clientId, doc.id))}>
                                Счёт-фактура
                              </DropdownMenuItem>
                            )}
                            {(() => {
                              const formCount: Record<string, number> = { INVOICE: 1, SALE: 4, FACTURA: 1 };
                              const total = chainDocsFor(doc).reduce((sum, d) => sum + (formCount[d.type] ?? 0), 0);
                              return total >= 2 ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setBatchPrintDoc(doc)}>
                                    Пакетная печать
                                  </DropdownMenuItem>
                                </>
                              ) : null;
                            })()}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                      </div>
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

      {printingAct && (
        <ActPrintModal
          clientId={clientId}
          refKey={printingAct.doc.id}
          docNumber={printingAct.doc.number}
          kind={printingAct.kind}
          onClose={() => setPrintingAct(null)}
        />
      )}

      {batchPrintDoc && (
        <BatchPrintModal
          clientId={clientId}
          chainDocs={chainDocsFor(batchPrintDoc)}
          triggerDocId={batchPrintDoc.id}
          onClose={() => setBatchPrintDoc(null)}
        />
      )}
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
              {key === '1C' && (
                <Link
                  href="/info/1c-connect"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Инструкция по подключению 1С"
                  className="h-7 w-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-50 flex-shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
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

// ─── Branding tab — letterhead (logo/stamp/text) for self-generated print forms ─
function BrandingTab({ clientId }: { clientId: string }) {
  const [logoUrl,      setLogoUrl]      = useState<string | null>(null);
  const [logoPosition, setLogoPosition] = useState<ClientBrandingOut['logo_position']>('top-left');
  const [stampUrl,     setStampUrl]     = useState<string | null>(null);
  const [sealUrl,      setSealUrl]      = useState<string | null>(null);
  const [facsimileUrl, setFacsimileUrl] = useState<string | null>(null);
  const [customText,   setCustomText]   = useState('');
  const [textPosition, setTextPosition] = useState<ClientBrandingOut['text_position']>('footer');
  const [logoFile,     setLogoFile]     = useState<File | null>(null);
  const [stampFile,    setStampFile]    = useState<File | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [error,        setError]        = useState('');
  const [importing,    setImporting]    = useState(false);
  const [importError,  setImportError]  = useState('');
  const [imported,     setImported]     = useState(false);

  useEffect(() => {
    apiFetch(API.clients.branding(clientId))
      .then((r) => r.ok ? r.json() : null)
      .then((d: ClientBrandingOut | null) => {
        if (!d) return;
        setLogoUrl(d.logo_url);
        setLogoPosition(d.logo_position);
        setStampUrl(d.stamp_url);
        setSealUrl(d.seal_url);
        setFacsimileUrl(d.facsimile_url);
        setCustomText(d.custom_text);
        setTextPosition(d.text_position);
      })
      .finally(() => setLoading(false));
  }, [clientId]);

  const handleImportFrom1c = async () => {
    setImporting(true);
    setImportError('');
    try {
      const res = await apiFetch(API.clients.brandingImport1c(clientId), { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportError(d.detail ?? 'Ошибка импорта');
        return;
      }
      setSealUrl(d.seal_url);
      setFacsimileUrl(d.facsimile_url);
      setImported(true);
      setTimeout(() => setImported(false), 2000);
    } catch {
      setImportError('Ошибка соединения с сервером');
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const form = new FormData();
      form.set('custom_text', customText);
      form.set('logo_position', logoPosition);
      form.set('text_position', textPosition);
      if (logoFile)  form.set('logo', logoFile);
      if (stampFile) form.set('stamp', stampFile);
      const res = await apiFetch(API.clients.branding(clientId), { method: 'POST', body: form });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail ?? 'Ошибка сохранения');
        return;
      }
      const d: ClientBrandingOut = await res.json();
      setLogoUrl(d.logo_url);
      setStampUrl(d.stamp_url);
      setLogoFile(null);
      setStampFile(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Ошибка соединения с сервером');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-xs text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Загрузка…</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full max-w-lg">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Оформление печатных форм</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Логотип, печать организации с подписью и произвольный текст — добавляются в счета и акты КС-2/КС-3.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-700">Логотип</label>
          {logoUrl && !logoFile && (
            <img src={logoUrl} alt="Логотип" className="h-12 border border-slate-100 rounded p-1 mb-1" />
          )}
          <input type="file" accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            className="text-xs" />
          <select value={logoPosition} onChange={(e) => setLogoPosition(e.target.value as typeof logoPosition)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-full mt-1.5">
            <option value="top-left">Слева сверху</option>
            <option value="top-center">По центру сверху</option>
            <option value="top-right">Справа сверху</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-700">Печать организации с подписью</label>
          {stampUrl && !stampFile && (
            <img src={stampUrl} alt="Печать" className="h-16 border border-slate-100 rounded p-1 mb-1" />
          )}
          <input type="file" accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setStampFile(e.target.files?.[0] ?? null)}
            className="text-xs" />
          <p className="text-[11px] text-slate-400">Изображение печати со скана — накладывается на подпись руководителя.</p>

          {!stampUrl && (sealUrl || facsimileUrl) && (
            <div className="flex items-center gap-2 mt-2">
              {sealUrl && <img src={sealUrl} alt="Печать из 1С" className="h-14 border border-slate-100 rounded p-1" />}
              {facsimileUrl && <img src={facsimileUrl} alt="Факсимиле из 1С" className="h-10 border border-slate-100 rounded p-1" />}
              <span className="text-[11px] text-emerald-600">· из 1С</span>
            </div>
          )}
          <div className="mt-1.5">
            <Button size="sm" variant="outline" type="button" onClick={handleImportFrom1c} disabled={importing}>
              {importing ? 'Импорт…' : imported ? '✓ Импортировано' : 'Импортировать печать/факсимиле из 1С'}
            </Button>
            {importError && <p className="text-[11px] text-red-600 mt-1">{importError}</p>}
            <p className="text-[11px] text-slate-400 mt-1">
              Подтянет печать и факсимиле подписи, если они уже загружены в саму организацию в 1С —
              не заменит ручную загрузку выше, если она уже сделана.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-700">Произвольный текст</label>
          <Textarea value={customText} onChange={(e) => setCustomText(e.target.value)}
            rows={3} className="text-xs" placeholder="Например, реквизиты для оплаты или благодарность за сотрудничество" />
          <select value={textPosition} onChange={(e) => setTextPosition(e.target.value as typeof textPosition)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 w-full mt-1.5">
            <option value="header">Вверху документа</option>
            <option value="footer">Внизу документа</option>
          </select>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Сохранение…' : saved ? '✓ Сохранено' : 'Сохранить'}
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
        {activeTab === 'branding'     && <BrandingTab clientId={clientId} />}
      </div>
    </div>
  );
}
