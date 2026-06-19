'use client';
import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Check, CheckCircle2, ChevronDown, ChevronRight, ArrowLeft,
  MessageSquare, MessageCircle, Zap, FileText, Send,
  Link2, Search, Wifi, WifiOff, ClipboardList, X,
} from 'lucide-react';
import { useChatStore }    from '@/store/useChatStore';
import { useClientStore, ClientContact } from '@/store/useClientStore';
import { useAppStore }     from '@/store/useAppStore';
import { usePendingStore } from '@/store/usePendingStore';
import { useTaskStore }    from '@/store/useTaskStore';
import { ChatMessage, IntegrationKey, TaskPriority } from '@/types';
import { TelegramIcon }    from '@/components/icons/TelegramIcon';
import { AiChatIcon }      from '@/components/icons/AiChatIcon';
import { TgApiMessage }    from '@/lib/api';
import { Textarea }        from '@/components/ui/textarea';
import { Button }          from '@/components/ui/button';
import { Input }           from '@/components/ui/input';
import { Label }           from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { API }             from '@/lib/api';
import { cn, formatTime, formatDate } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

// ─── Channel badge ─────────────────────────────────────────────────────────────
type ChCfg = { icon: React.ReactNode; iconLg: React.ReactNode; cls: string; short: string };
const CH: Record<IntegrationKey, ChCfg> = {
  TG:            { icon:<TelegramIcon className="h-3 w-3" />,  iconLg:<TelegramIcon className="h-5 w-5" />,  cls:'bg-sky-100 text-sky-600',      short:'TG'    },
  VK:            { icon:<MessageCircle className="h-3 w-3" />, iconLg:<MessageCircle className="h-5 w-5" />, cls:'bg-indigo-100 text-indigo-600', short:'ВК'    },
  INTERNAL_CHAT: { icon:<MessageSquare className="h-3 w-3" />, iconLg:<MessageSquare className="h-5 w-5" />, cls:'bg-violet-100 text-violet-600', short:'Внутр' },
  MAX:           { icon:<Zap className="h-3 w-3" />,           iconLg:<Zap className="h-5 w-5" />,           cls:'bg-amber-100 text-amber-600',   short:'MAX'   },
  '1C':          { icon:null,                                   iconLg:null,                                  cls:'bg-red-100 text-red-600',         short:'1С:Фреш' },
  MOYSKLAD:      { icon:<span className="text-[9px] font-bold">МС</span>, iconLg:<span className="text-xs font-bold">МС</span>, cls:'bg-emerald-100 text-emerald-600', short:'МС'  },
  B24:           { icon:<span className="text-[9px] font-bold">B</span>,  iconLg:<span className="text-xs font-bold">B</span>,  cls:'bg-orange-100 text-orange-600',   short:'B24' },
  DIADOC:        { icon:<FileText className="h-3 w-3" />,      iconLg:<FileText className="h-5 w-5" />,      cls:'bg-teal-100 text-teal-600',     short:'ДД'    },
  PORTAL:        { icon:<AiChatIcon className="h-3 w-3" />,    iconLg:<AiChatIcon className="h-5 w-5" />,    cls:'bg-purple-100 text-purple-600',  short:'WEB'   },
};

// Integrations that sync data but never carry chat messages — excluded from chat tabs.
const NON_MESSENGER_CHANNELS: IntegrationKey[] = ['1C', 'MOYSKLAD', 'DIADOC'];

function ChBadge({ ch, selected }: { ch: IntegrationKey; selected?: boolean }) {
  const cfg = CH[ch] ?? CH.INTERNAL_CHAT;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
      selected ? 'bg-white/15 text-white' : cfg.cls,
    )}>
      {cfg.icon}
      {/* TG: icon only; others show short label */}
      {ch !== 'TG' && <span className="ml-0.5">{cfg.short}</span>}
    </span>
  );
}

// ─── Data shape ────────────────────────────────────────────────────────────────
export interface Group {
  client:      ClientContact;
  msgs:        ChatMessage[];
  unprocessed: ChatMessage[];
  oldestTs:    number | null;
}

// ─── Task dialog ─────────────────────────────────────────────────────────────
const PRIO_LABEL: Record<TaskPriority, string> = {
  LOW: 'Низкий', MEDIUM: 'Средний', HIGH: 'Высокий', URGENT: 'Срочно',
};
const DEFAULT_TASK_TITLE = 'Задача по сообщению из чата';

function TaskDialog({ open, onOpenChange, quotedText, msgIds, clientId, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  quotedText: string; msgIds: string[]; clientId?: string; onCreated: () => void;
}) {
  const addTask = useTaskStore((s) => s.addTask);
  const [title,   setTitle]   = useState(DEFAULT_TASK_TITLE);
  const [prio,    setPrio]    = useState<TaskPriority>('MEDIUM');
  const [due,     setDue]     = useState('');
  const [dueTime, setDueTime] = useState('');

  useEffect(() => {
    if (!open) { setTitle(DEFAULT_TASK_TITLE); setPrio('MEDIUM'); setDue(''); setDueTime(''); }
  }, [open]);

  const submit = () => {
    if (!title.trim()) return;
    addTask({
      title:            title.trim(),
      priority:         prio,
      status:           'TODO',
      clientId:         clientId || undefined,
      quotedText:       quotedText || undefined,
      sourceMessageIds: msgIds.length ? msgIds : undefined,
      dueDate:          due ? new Date(`${due}T${dueTime || '00:00'}`) : undefined,
    });
    onOpenChange(false); onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="text-sm">Создать задачу</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Название *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Что нужно сделать?" className="h-9 text-sm" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Приоритет</Label>
              <Select value={prio} onValueChange={(v) => setPrio(v as TaskPriority)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TaskPriority[]).map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">{PRIO_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Срок</Label>
              <div className="flex gap-1.5">
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 text-xs flex-1 min-w-0" />
                <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!due} className="h-9 text-xs w-24 flex-shrink-0" />
              </div>
            </div>
          </div>
          {quotedText && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Цитата ({msgIds.length} сообщ.)</Label>
              <div className="rounded-md border border-dashed bg-slate-50 p-3 max-h-32 overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap font-sans text-slate-600">{quotedText}</pre>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button size="sm" onClick={submit} disabled={!title.trim()}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Selection bar (shared) ───────────────────────────────────────────────────
function SelectionBar({ count, onTask, onClear }: {
  count: number; onTask: () => void; onClear: () => void;
}) {
  return (
    <div className="flex-shrink-0 bg-blue-600 text-white px-4 py-2 flex items-center gap-3 text-xs">
      <span className="font-medium flex-1">Выбрано: {count}</span>
      <Button size="sm" variant="secondary"
        className="h-7 text-xs bg-white text-blue-700 hover:bg-blue-50"
        onClick={onTask}>
        <ClipboardList className="mr-1.5 h-3 w-3" />
        Создать задачу
      </Button>
      <button type="button" onClick={onClear} className="p-1 rounded hover:bg-blue-500">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Contact card ─────────────────────────────────────────────────────────────
function ContactCard({ group, onClick }: { group: Group; onClick: () => void }) {
  const allDone = group.unprocessed.length === 0;
  const lastMsg = group.msgs[group.msgs.length - 1];
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-start gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all text-left">
      <div className={cn('h-11 w-11 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold', group.client.color)}>
        {group.client.initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-sm font-semibold text-slate-800 truncate">{group.client.shortName}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {lastMsg && <span className="text-[11px] text-slate-400">{formatTime(new Date(lastMsg.timestamp))}</span>}
            {!allDone && group.unprocessed.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[20px] h-5 flex items-center justify-center">
                {group.unprocessed.length}
              </span>
            )}
            {allDone && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
          </div>
        </div>
        {lastMsg && (
          <p className="text-xs text-slate-500 truncate mb-2">
            {lastMsg.senderName === 'Бухгалтер' ? 'Вы: ' : ''}{lastMsg.text}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          {group.client.activeChannels.slice(0, 3).map((ch) => <ChBadge key={ch} ch={ch} />)}
          {!allDone && group.oldestTs && (
            <span className="text-[10px] text-amber-600 font-medium ml-1">
              Ожидает с {formatTime(new Date(group.oldestTs))}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Pending card ─────────────────────────────────────────────────────────────
function PendingCard({ chatId, msgs, unprocessed, onClick }: {
  chatId: number; msgs: TgApiMessage[]; unprocessed: number; onClick: () => void;
}) {
  const allDone    = unprocessed === 0;
  const senderName = msgs[0]?.sender_name || msgs[0]?.username || `TG ${chatId}`;
  const lastMsg    = msgs[msgs.length - 1];
  return (
    <button type="button" onClick={onClick}
      className={cn(
        'w-full flex items-start gap-4 p-4 rounded-xl border hover:shadow-sm transition-all text-left',
        allDone
          ? 'bg-white border-slate-200 hover:border-slate-300'
          : 'bg-amber-50 border-amber-200 hover:border-amber-300',
      )}>
      <div className={cn(
        'h-11 w-11 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold',
        allDone ? 'bg-slate-100 text-slate-500' : 'bg-amber-200 text-amber-800',
      )}>
        {senderName[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-sm font-semibold text-slate-800 truncate">{senderName}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {lastMsg && <span className="text-[11px] text-slate-400">{formatTime(new Date(lastMsg.timestamp))}</span>}
            {!allDone && (
              <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[20px] h-5 flex items-center justify-center">
                {unprocessed}
              </span>
            )}
            {allDone && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
          </div>
        </div>
        {lastMsg && <p className="text-xs text-slate-500 truncate mb-1.5">{lastMsg.text}</p>}
        <div className="flex items-center gap-1.5">
          <ChBadge ch="TG" />
          <span className={cn('text-[10px] font-medium', allDone ? 'text-slate-400' : 'text-amber-600')}>
            Без клиента
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Link pending chat to client dialog ────────────────────────────────────────
function LinkDialog({ chatId, msgs, onLink, onClose }: {
  chatId: number; msgs: TgApiMessage[];
  onLink: (clientId: string) => void; onClose: () => void;
}) {
  const { clients } = useClientStore();
  const [search, setSearch] = useState('');
  const senderName = msgs[0]?.sender_name || msgs[0]?.username || `TG ${chatId}`;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.inn?.includes(q));
  }, [clients, search]);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-sm">Прикрепить к клиенту</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-500 -mt-1">
          Чат с <strong>{senderName}</strong> ({msgs.length} сообщ.) будет привязан навсегда.
        </p>
        <div className="relative mt-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или ИНН..." className="h-8 pl-8 text-xs" autoFocus />
        </div>
        <div className="max-h-52 overflow-y-auto -mx-1 space-y-0.5 mt-1">
          {filtered.map((c) => (
            <button key={c.id} type="button" onClick={() => onLink(c.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-slate-50 transition-colors">
              <div className={cn('h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold', c.color)}>
                {c.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.shortName}</p>
                {c.inn && <p className="text-[10px] text-muted-foreground">ИНН {c.inn}</p>}
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Клиент не найден</p>}
        </div>
        <DialogFooter><Button variant="ghost" size="sm" onClick={onClose}>Отмена</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pending chat view ────────────────────────────────────────────────────────
function PendingChatView({ chatId, msgs, onAttach, onBack }: {
  chatId: number; msgs: TgApiMessage[]; onAttach: () => void; onBack?: () => void;
}) {
  const { demoMode }  = useAppStore();
  const { doneIds, markDone } = usePendingStore();
  const senderName    = msgs[0]?.sender_name || msgs[0]?.username || `TG ${chatId}`;
  const initials      = senderName.slice(0, 2).toUpperCase();
  const bottomRef     = useRef<HTMLDivElement>(null);

  const [draft,       setDraft]       = useState('');
  const [sent,        setSent]        = useState<{ id: string; text: string; ts: Date }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [taskOpen,    setTaskOpen]    = useState(false);

  type MsgRow = { id: string; text: string; ts: Date; isSelf: boolean; senderName: string };

  const sorted = useMemo<MsgRow[]>(() => {
    const incoming: MsgRow[] = msgs.map((m) => ({
      id: m.id, text: m.text, ts: new Date(m.timestamp), isSelf: false,
      senderName: m.sender_name || m.username || `TG ${chatId}`,
    }));
    const outgoing: MsgRow[] = sent.map((s) => ({ ...s, isSelf: true, senderName: 'Бухгалтер' }));
    return [...incoming, ...outgoing].sort((a, b) => a.ts.getTime() - b.ts.getTime());
  }, [msgs, sent, chatId]);

  const unprocessedCount = msgs.filter((m) => !doneIds.includes(m.id)).length;
  const allDone          = unprocessedCount === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [sorted.length]);

  const toggleSelect   = useCallback((id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]), []);
  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const selectedRows = useMemo(() => sorted.filter((m) => selectedIds.includes(m.id)), [sorted, selectedIds]);
  const quote = useMemo(
    () => [...selectedRows]
      .sort((a, b) => a.ts.getTime() - b.ts.getTime())
      .map((m) => `[${formatDate(m.ts)} ${formatTime(m.ts)} | ${m.senderName}]: ${m.text}`)
      .join('\n'),
    [selectedRows],
  );

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    if (!demoMode) {
      try {
        await fetch(API.telegram.send(), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
        });
      } catch {}
    }
    setSent((prev) => [...prev, { id: `sent-${Date.now()}`, text, ts: new Date() }]);
    setDraft('');
  }, [draft, chatId, demoMode]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white shadow-sm">
        {onBack && (
          <button type="button" onClick={onBack}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="h-9 w-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold bg-amber-100 text-amber-700">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 leading-none">{senderName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ChBadge ch="TG" />
            <span className="text-[11px] text-amber-600">Без клиента</span>
          </div>
        </div>
        {unprocessedCount > 0 ? (
          <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100 flex-shrink-0">
            {unprocessedCount} необработано
          </span>
        ) : (
          <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 flex items-center gap-1 flex-shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Всё обработано
          </span>
        )}
        <button type="button" onClick={onAttach}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 transition-colors flex-shrink-0">
          <Link2 className="h-3.5 w-3.5" />
          Прикрепить
        </button>
      </div>

      {/* Selection bar */}
      {selectedIds.length > 0 && (
        <SelectionBar count={selectedIds.length} onTask={() => setTaskOpen(true)} onClear={clearSelection} />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-2 bg-slate-50">
        {sorted.map((msg) => {
          const isSelected = selectedIds.includes(msg.id);
          const isDone     = !msg.isSelf && doneIds.includes(msg.id);
          return (
            <div key={msg.id}
              onClick={() => toggleSelect(msg.id)}
              className={cn(
                'flex items-end gap-2 rounded-lg px-1 transition-colors cursor-pointer',
                msg.isSelf ? 'flex-row-reverse' : 'flex-row',
                isSelected ? 'bg-blue-100 ring-1 ring-inset ring-blue-300' : 'hover:bg-slate-100/60',
              )}>
              <div className={cn(
                'max-w-[65%] rounded-2xl px-4 py-2.5 transition-all duration-200',
                msg.isSelf
                  ? 'bg-slate-800 text-white rounded-br-sm'
                  : isDone
                    ? 'bg-slate-100 border border-slate-200 text-slate-400 opacity-60 rounded-bl-sm'
                    : 'bg-white border border-slate-200 text-slate-800 shadow-sm rounded-bl-sm',
              )}>
                <p className="text-sm leading-snug whitespace-pre-wrap">{msg.text}</p>
                <span className={cn('text-[10px] mt-1 block text-right', msg.isSelf ? 'text-white/40' : 'text-slate-400')}>
                  {formatTime(msg.ts)}
                  {isDone && <span className="ml-1 text-emerald-500">✓</span>}
                </span>
              </div>
              {!msg.isSelf && (
                isDone ? (
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); markDone(msg.id); }}
                    title="Вернуть в обработку"
                    className="flex-shrink-0 mb-1.5 text-emerald-500 hover:text-slate-400 transition-colors">
                    <CheckCircle2 className="h-5 w-5" />
                  </button>
                ) : (
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); markDone(msg.id); }}
                    title="Обработано"
                    className="flex-shrink-0 h-5 w-5 rounded border-2 border-slate-300 hover:border-emerald-400 hover:bg-emerald-50 transition-all flex items-center justify-center group mb-1.5">
                    <Check className="h-3 w-3 text-transparent group-hover:text-emerald-500 transition-colors" />
                  </button>
                )
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen}
        quotedText={quote} msgIds={[...selectedIds]} onCreated={clearSelection} />

      {/* Input */}
      <div className="flex-shrink-0 border-t border-slate-100 px-4 py-3 bg-white flex items-end gap-2">
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={`Ответить ${senderName}... (Enter — отправить)`}
          className="flex-1 min-h-[38px] max-h-28 text-sm resize-none" rows={1} />
        <Button size="sm" onClick={handleSend} disabled={!draft.trim()} className="h-9 w-9 p-0 flex-shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Classic chat view ────────────────────────────────────────────────────────
export function ChatView({ group, onMarkDone, onBack, highlightIds, focusId }: {
  group:       Group;
  onMarkDone:  (id: string) => void;
  onBack?:     () => void;
  highlightIds?: string[];
  focusId?:    string;
}) {
  const [draft,        setDraft]        = useState('');
  const [selectedIds,  setSelectedIds]  = useState<string[]>([]);
  const [taskOpen,     setTaskOpen]     = useState(false);
  const [activeTab,    setActiveTab]    = useState<IntegrationKey | null>(null);
  const { addMessage } = useChatStore();
  const { demoMode }   = useAppStore();
  const bottomRef      = useRef<HTMLDivElement>(null);
  const msgRefs        = useRef<Record<string, HTMLDivElement | null>>({});

  // Channels present for this client, each with its unread count and last-message time.
  // Sorted so the channel with the most recent message appears first.
  // 1C/MoySklad/Diadoc are data-sync integrations, not messengers — never shown as a chat tab.
  const channelTabs = useMemo(() => {
    const set = new Set<IntegrationKey>(group.client.activeChannels);
    group.msgs.forEach((m) => set.add(m.channel));
    NON_MESSENGER_CHANNELS.forEach((ch) => set.delete(ch));
    return Array.from(set).map((ch) => {
      const chMsgs   = group.msgs.filter((m) => m.channel === ch);
      const lastTs   = chMsgs.length ? Math.max(...chMsgs.map((m) => new Date(m.timestamp).getTime())) : 0;
      const unread   = chMsgs.filter((m) => !m.done && m.senderId !== 'u1').length;
      return { ch, lastTs, unread };
    }).sort((a, b) => b.lastTs - a.lastTs);
  }, [group.client.activeChannels, group.msgs]);

  // Explicit tab selection wins; otherwise default to the channel with the most recent message.
  const effectiveTab = activeTab ?? channelTabs[0]?.ch ?? 'INTERNAL_CHAT';

  // Non-messenger integrations (1C, etc.) — shown as a muted line under the name, not as colored badges.
  const dataChannels = useMemo(
    () => group.client.activeChannels.filter((ch) => NON_MESSENGER_CHANNELS.includes(ch)),
    [group.client.activeChannels],
  );

  const toggleSelect   = useCallback((id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]), []);
  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const selectedMsgs = useMemo(() => group.msgs.filter((m) => selectedIds.includes(m.id)), [group.msgs, selectedIds]);
  const quote = useMemo(
    () => [...selectedMsgs]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((m) => `[${formatDate(m.timestamp)} ${formatTime(m.timestamp)} | ${m.senderName}]: ${m.text}`)
      .join('\n'),
    [selectedMsgs],
  );

  // The message to scroll/focus on — the one actually clicked, or the first highlighted one
  // when arriving without a specific focus target (e.g. via the bare "open chat" link).
  const focusTargetId = focusId ?? highlightIds?.[0];

  // A focused message lives on its own channel tab — switch to it so the message actually renders.
  // useLayoutEffect (not useEffect) so the correct tab is committed before the browser paints —
  // otherwise the very first paint after navigating from a task briefly shows the wrong tab
  // and the focused message's ref never mounts in time for the scroll effect below.
  useLayoutEffect(() => {
    if (!focusTargetId) return;
    const msg = group.msgs.find((m) => m.id === focusTargetId);
    if (msg && msg.channel !== activeTab) setActiveTab(msg.channel);
  }, [focusTargetId, group.client.id, group.msgs.length]);

  // Scroll to bottom on new messages; scroll to the focused message when present.
  // The focused message's tab may still be switching (see effect above), so its ref might
  // not be mounted on the very first render after navigation — retry across a few animation
  // frames instead of giving up (and falling back to "scroll to bottom") on the first miss.
  useEffect(() => {
    if (!focusTargetId) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      return;
    }
    let frame = 0;
    let attempts = 0;
    const tryScroll = () => {
      const el = msgRefs.current[focusTargetId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (attempts++ < 15) {
        frame = requestAnimationFrame(tryScroll);
      }
    };
    frame = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(frame);
  }, [group.msgs.length, group.client.id, focusTargetId, effectiveTab]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    const tgChatId      = !demoMode ? group.client.channelIds?.TG : undefined;
    const portalClientId = !demoMode ? (group.client.channelIds?.PORTAL as string | undefined) : undefined;

    // Reply always goes out on the open tab's channel.
    const channel: IntegrationKey = effectiveTab;

    // Default id for channels with no server-assigned id of their own (e.g. PORTAL).
    let id = `m-${Date.now()}`;

    if (channel === 'TG' && tgChatId) {
      try {
        const res = await fetch(API.telegram.send(), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: tgChatId, text }),
        });
        const data = await res.json();
        // Match the id the backend already stored for this send — avoids a duplicate
        // bubble once /telegram/messages or GET /chat/messages later returns the same row.
        if (data?.message_id) id = `sent-${data.message_id}-${tgChatId}`;
      } catch {}
    }
    if (channel === 'PORTAL' && portalClientId) {
      try {
        await fetch(API.portal.chatReply(), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: 1, portal_client_id: portalClientId, text, sender_name: 'Бухгалтер' }),
        });
      } catch {}
    }
    addMessage({
      id, channel, senderId: 'u1', senderName: 'Бухгалтер',
      text, timestamp: new Date(), read: true, clientId: group.client.id,
    });
    setDraft('');
  }, [draft, group.client, demoMode, addMessage, effectiveTab]);

  const sortedMsgs = useMemo(
    () => [...group.msgs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [group.msgs],
  );

  const visibleMsgs = useMemo(
    () => sortedMsgs.filter((m) => m.channel === effectiveTab),
    [sortedMsgs, effectiveTab],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white shadow-sm">
        {onBack && (
          <button type="button" onClick={onBack}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className={cn('h-9 w-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold', group.client.color)}>
          {group.client.initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 leading-none">{group.client.name}</p>
          {dataChannels.length > 0 && (
            <p className="text-[11px] text-slate-400 mt-1 truncate">
              {dataChannels.map((ch) => CH[ch]?.short ?? ch).join(' · ')}
            </p>
          )}
        </div>
        {group.unprocessed.length > 0 ? (
          <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
            {group.unprocessed.length} необработано
          </span>
        ) : (
          <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Всё обработано
          </span>
        )}
      </div>

      {/* Channel tabs — the real navigation: active messenger gets full color, the rest stay muted */}
      {channelTabs.length > 1 && (
        <div className="flex-shrink-0 flex items-center gap-0.5 px-2 border-b border-slate-100 bg-white overflow-x-auto">
          {channelTabs.map(({ ch, unread }) => {
            const cfg      = CH[ch] ?? CH.INTERNAL_CHAT;
            const isActive = effectiveTab === ch;
            return (
              <button key={ch} type="button" onClick={() => setActiveTab(ch)}
                className={cn(
                  'relative flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
                  isActive ? 'border-slate-800' : 'border-transparent hover:border-slate-200',
                )}>
                <span className={cn(
                  'flex items-center justify-center h-9 w-9 rounded-full transition-colors',
                  isActive ? cfg.cls : 'bg-slate-100 text-slate-400',
                )}>
                  {cfg.iconLg}
                </span>
                {ch !== 'TG' && ch !== 'PORTAL' && (
                  <span className={isActive ? 'text-slate-900' : 'text-slate-400'}>{cfg.short}</span>
                )}
                {unread > 0 && (
                  <span className="absolute top-0.5 right-0 h-4 w-4 rounded-full bg-red-500 border border-white text-white text-[9px] font-bold flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Selection bar */}
      {selectedIds.length > 0 && (
        <SelectionBar count={selectedIds.length} onTask={() => setTaskOpen(true)} onClear={clearSelection} />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-2 bg-slate-50">
        {visibleMsgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <MessageSquare className="h-10 w-10 text-slate-100" />
            <p className="text-xs">Нет сообщений в этой вкладке</p>
          </div>
        ) : visibleMsgs.map((msg) => {
          const isSelf       = msg.senderId === 'u1' || msg.senderName === 'Бухгалтер';
          const isSelected   = selectedIds.includes(msg.id);
          const isFocused     = msg.id === focusTargetId;
          const isHighlighted = !isFocused && (highlightIds?.includes(msg.id) ?? false);
          return (
            <div key={msg.id}
              ref={(el) => { msgRefs.current[msg.id] = el; }}
              onClick={() => toggleSelect(msg.id)}
              className={cn(
                'flex items-end gap-2 rounded-lg px-1 transition-all cursor-pointer',
                isSelf ? 'flex-row-reverse' : 'flex-row',
                isFocused     ? 'bg-yellow-100 ring-2 ring-inset ring-yellow-400 animate-pulse' :
                isHighlighted ? 'bg-yellow-50 ring-1 ring-inset ring-yellow-300' :
                isSelected    ? 'bg-blue-100 ring-1 ring-inset ring-blue-300' : 'hover:bg-slate-100/60',
              )}>
              <div className={cn(
                'max-w-[65%] rounded-2xl px-4 py-2.5 transition-all duration-300',
                isSelf
                  ? 'bg-slate-800 text-white rounded-br-sm'
                  : msg.done
                    ? 'bg-slate-100 border border-slate-200 text-slate-400 opacity-60 rounded-bl-sm'
                    : 'bg-white border border-slate-200 text-slate-800 shadow-sm rounded-bl-sm',
              )}>
                <p className="text-sm leading-snug whitespace-pre-wrap">{msg.text}</p>
                <div className={cn('flex items-center gap-1.5 mt-1',
                  isSelf ? 'justify-end' : msg.done ? 'justify-between' : 'justify-end')}>
                  <span className={cn('text-[10px]', isSelf ? 'text-white/40' : 'text-slate-400')}>
                    {formatTime(new Date(msg.timestamp))}
                  </span>
                  {!isSelf && msg.done && msg.doneAt && (
                    <span className="text-[10px] text-emerald-500 flex items-center gap-0.5">
                      <CheckCircle2 className="h-3 w-3" />
                      {formatTime(new Date(msg.doneAt))}
                    </span>
                  )}
                </div>
              </div>
              {!isSelf && (
                msg.done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mb-1.5" />
                ) : (
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); onMarkDone(msg.id); }}
                    title="Обработано"
                    className="flex-shrink-0 h-5 w-5 rounded border-2 border-slate-300 hover:border-emerald-400 hover:bg-emerald-50 transition-all flex items-center justify-center group mb-1.5">
                    <Check className="h-3 w-3 text-transparent group-hover:text-emerald-500 transition-colors" />
                  </button>
                )
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen}
        quotedText={quote} msgIds={[...selectedIds]} clientId={group.client.id} onCreated={clearSelection} />

      {/* Input */}
      <div className="flex-shrink-0 border-t border-slate-100 px-4 py-3 bg-white flex items-end gap-2">
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={`Ответить ${group.client.shortName}... (Enter — отправить)`}
          className="flex-1 min-h-[38px] max-h-28 text-sm resize-none" rows={1} />
        <Button size="sm" onClick={handleSend} disabled={!draft.trim()} className="h-9 w-9 p-0 flex-shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export function ChatCRM() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const { messages, markDone, addMessage } = useChatStore();
  const { clients, updateChannelId }       = useClientStore();
  const { demoMode }                       = useAppStore();
  const {
    groups: pendingGroupsMap, tgOnline, removeGroup, doneIds,
    openChatClientId, setOpenChatClientId,
  } = usePendingStore();

  // Derive view state from URL — survives page refresh
  const selectedId            = searchParams.get('client');
  const pendingParam          = searchParams.get('pending');
  const highlightParam        = searchParams.get('highlight');
  const focusId                = searchParams.get('focus') ?? undefined;
  const highlightIds = useMemo(
    () => highlightParam ? highlightParam.split(',').filter(Boolean) : undefined,
    [highlightParam],
  );
  const selectedPendingChatId = pendingParam ? Number(pendingParam) : null;
  const view                  = selectedId || pendingParam ? 'chat' : 'list';

  const [showDone,   setShowDone]   = useState(true);
  const [linkChatId, setLinkChatId] = useState<number | null>(null);

  // When navigated from TaskManager via openChatClientId → redirect via URL
  useEffect(() => {
    if (openChatClientId) {
      router.replace(`/chats?client=${encodeURIComponent(openChatClientId)}`);
      setOpenChatClientId(null);
    }
  }, [openChatClientId, router, setOpenChatClientId]);

  // Poll for unknown-sender messages while on this page → usePendingStore
  useEffect(() => {
    if (demoMode) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const poll = async () => {
      try {
        const res = await fetch(API.telegram.messages(200));
        if (!res.ok) return;
        const data: { messages: TgApiMessage[] } = await res.json();
        if (!data.messages.length) return;
        const chatStoreIds = new Set(useChatStore.getState().messages.map((m) => m.id));
        const pendingState = usePendingStore.getState();
        for (const tg of data.messages) {
          if (!tg.text) continue;
          if (chatStoreIds.has(tg.id)) continue;
          if (pendingState.hasId(tg.id)) continue;
          const hasClient = useClientStore.getState().clients.some(
            (c) => c.channelIds?.TG !== undefined && String(c.channelIds.TG) === String(tg.chat_id),
          );
          if (!hasClient) pendingState.addMessage(tg);
        }
      } catch {}
    };
    poll();
    intervalId = setInterval(poll, 5_000);
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [demoMode]);

  // Group messages by client
  const groups = useMemo<Group[]>(() => {
    return clients.map((client) => {
      const msgs = messages
        .filter((m) => m.clientId === client.id)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (msgs.length === 0) return null;
      const unprocessed = msgs.filter((m) => !m.done && m.senderId !== 'u1');
      const oldestTs    = unprocessed.length > 0
        ? Math.min(...unprocessed.map((m) => new Date(m.timestamp).getTime()))
        : null;
      return { client, msgs, unprocessed, oldestTs };
    }).filter(Boolean) as Group[];
  }, [messages, clients]);

  const pendingEntries = useMemo(
    () => Object.entries(pendingGroupsMap).map(([k, v]) => [Number(k), v] as [number, TgApiMessage[]]),
    [pendingGroupsMap],
  );

  // Unified list: client groups + pending groups, sorted by last message time
  type AnyItem =
    | { kind: 'client';  group: Group;       unprocessed: number; lastTs: number }
    | { kind: 'pending'; chatId: number; msgs: TgApiMessage[]; unprocessed: number; lastTs: number };

  const allItems = useMemo<AnyItem[]>(() => {
    const clientItems: AnyItem[] = groups.map((g) => ({
      kind: 'client', group: g,
      unprocessed: g.unprocessed.length,
      lastTs: g.msgs.length > 0 ? new Date(g.msgs[g.msgs.length - 1].timestamp).getTime() : 0,
    }));
    const pendingItems: AnyItem[] = pendingEntries.map(([chatId, msgs]) => ({
      kind: 'pending', chatId, msgs,
      unprocessed: msgs.filter((m) => !doneIds.includes(m.id)).length,
      lastTs: msgs.reduce((max, m) => Math.max(max, new Date(m.timestamp).getTime()), 0),
    }));
    return [...clientItems, ...pendingItems];
  }, [groups, pendingEntries, doneIds]);

  const active = useMemo(() =>
    allItems.filter((i) => i.unprocessed > 0).sort((a, b) => a.lastTs - b.lastTs),
    [allItems],
  );
  const done = useMemo(() =>
    allItems.filter((i) => i.unprocessed === 0).sort((a, b) => b.lastTs - a.lastTs),
    [allItems],
  );

  const selectedGroup = groups.find((g) => g.client.id === selectedId) ?? null;

  const selectClient  = useCallback((id: string) =>
    router.replace(`/chats?client=${encodeURIComponent(id)}`), [router]);

  const selectPending = useCallback((chatId: number) =>
    router.replace(`/chats?pending=${chatId}`), [router]);

  const handleBack    = useCallback(() => router.replace('/chats'), [router]);

  const handleLink = useCallback((chatId: number, clientId: string) => {
    updateChannelId(clientId, 'TG', chatId);
    const msgs = pendingGroupsMap[chatId] ?? [];
    msgs.forEach((m) => {
      addMessage({
        id: m.id, channel: 'TG', senderId: String(m.sender_id),
        senderName: m.sender_name || m.username || 'TG',
        text: m.text, timestamp: new Date(m.timestamp),
        read: false, clientId,
        tgChatId: m.chat_id, username: m.username,
      } as ChatMessage);
    });
    removeGroup(chatId);
    setLinkChatId(null);
    router.replace(`/chats?client=${encodeURIComponent(clientId)}`);
  }, [updateChannelId, addMessage, pendingGroupsMap, removeGroup, router]);

  function renderCard(item: AnyItem) {
    if (item.kind === 'client') {
      return <ContactCard key={item.group.client.id} group={item.group} onClick={() => selectClient(item.group.client.id)} />;
    }
    return <PendingCard key={item.chatId} chatId={item.chatId} msgs={item.msgs}
      unprocessed={item.unprocessed} onClick={() => selectPending(item.chatId)} />;
  }

  return (
    <div className="h-full overflow-hidden">

      {view === 'list' ? (

        /* ── LIST VIEW ── */
        <div className="h-full flex flex-col overflow-hidden bg-slate-50">
          <div className="flex-shrink-0 bg-white border-b border-slate-100 px-6 py-4">
            <div className="max-w-2xl mx-auto flex items-center justify-between">
              <div>
                <h1 className="text-base font-bold text-slate-900">Чаты</h1>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {active.length > 0
                    ? `${active.length} активных · ${done.length} обработанных`
                    : done.length > 0 ? 'Все обработаны' : 'Нет сообщений'}
                </p>
              </div>
              {!demoMode && (
                <span className="flex items-center gap-1.5">
                  {tgOnline
                    ? <><Wifi className="h-3.5 w-3.5 text-emerald-500" /><span className="text-xs text-emerald-600 font-medium">Telegram Live</span></>
                    : <><WifiOff className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs text-slate-400">offline</span></>}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="max-w-2xl mx-auto px-6 py-5 space-y-3">

              {/* Обработанные — сверху, сворачиваемые */}
              {done.length > 0 && (
                <div>
                  <button type="button"
                    onClick={() => setShowDone((v) => !v)}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-700 transition-colors py-1 w-full">
                    {showDone
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />}
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Обработанные · {done.length}
                  </button>
                  {showDone && (
                    <div className="mt-2 space-y-2">
                      {done.map((i) => renderCard(i))}
                    </div>
                  )}
                </div>
              )}

              {/* Активные чаты (клиенты и pending вместе) */}
              {active.length > 0 && (
                <div className="space-y-2">
                  {active.map((i) => renderCard(i))}
                </div>
              )}

              {/* Empty state */}
              {active.length === 0 && done.length === 0 && (
                <div className="flex flex-col items-center py-20 gap-3 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 text-slate-100" />
                  <p className="text-sm">Нет сообщений</p>
                  <p className="text-xs text-slate-400 text-center">
                    Когда клиент напишет в Telegram, сообщение появится здесь
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

      ) : (

        /* ── CHAT VIEW ── */
        <>
          {selectedPendingChatId !== null && pendingGroupsMap[selectedPendingChatId] ? (
            <PendingChatView
              key={selectedPendingChatId}
              chatId={selectedPendingChatId}
              msgs={pendingGroupsMap[selectedPendingChatId]}
              onAttach={() => setLinkChatId(selectedPendingChatId)}
              onBack={handleBack}
            />
          ) : selectedGroup ? (
            <ChatView key={selectedGroup.client.id} group={selectedGroup} onMarkDone={markDone} onBack={handleBack} highlightIds={highlightIds} focusId={focusId} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <MessageSquare className="h-12 w-12 text-slate-100" />
              <p className="text-sm">Чат не найден</p>
              <button type="button" onClick={handleBack} className="text-xs text-blue-600 underline">← Назад к чатам</button>
            </div>
          )}
        </>
      )}

      {linkChatId !== null && pendingGroupsMap[linkChatId] && (
        <LinkDialog chatId={linkChatId} msgs={pendingGroupsMap[linkChatId]}
          onLink={(clientId) => handleLink(linkChatId, clientId)}
          onClose={() => setLinkChatId(null)} />
      )}
    </div>
  );
}
