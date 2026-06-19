'use client';

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Send, X, CheckSquare, ClipboardList,
  MessageSquare, MessageCircle, Zap, FileText,
  Search, Users, GitMerge, Plus, Wifi, WifiOff,
} from 'lucide-react';
import { Badge }    from '@/components/ui/badge';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useChatStore }   from '@/store/useChatStore';
import { useTaskStore }   from '@/store/useTaskStore';
import { useAppStore }    from '@/store/useAppStore';
import {
  useClientStore, ClientContact,
} from '@/store/useClientStore';
import { TelegramIcon }   from '@/components/icons/TelegramIcon';
import { AiChatIcon }     from '@/components/icons/AiChatIcon';
import { API, TgApiMessage } from '@/lib/api';
import { ChatMessage, IntegrationKey, TaskPriority } from '@/types';
import { cn, formatTime, formatDate } from '@/lib/utils';

// ─── Channel badge ────────────────────────────────────────────────────────────

type ChCfg = { icon: React.ReactNode; cls: string; label: string };
const CH_CFG: Record<IntegrationKey, ChCfg> = {
  TG:            { icon: <TelegramIcon className="h-3 w-3" />,       cls:'bg-sky-100 text-sky-600',      label:'Telegram'    },
  VK:            { icon: <MessageCircle className="h-3 w-3" />,      cls:'bg-indigo-100 text-indigo-600', label:'ВКонтакте'   },
  INTERNAL_CHAT: { icon: <MessageSquare className="h-3 w-3" />,      cls:'bg-violet-100 text-violet-600', label:'Внутренний'  },
  MAX:           { icon: <Zap className="h-3 w-3" />,                cls:'bg-amber-100 text-amber-600',   label:'MAX'         },
  '1C':          { icon: null,                                  cls:'bg-red-100 text-red-600', label:'1С:Фреш'     },
  MOYSKLAD:      { icon: <span className="text-[9px] font-bold">МС</span>, cls:'bg-emerald-100 text-emerald-600', label:'МойСклад' },
  B24:           { icon: <span className="text-[9px] font-bold">B</span>,  cls:'bg-orange-100 text-orange-600', label:'Битрикс24' },
  DIADOC:        { icon: <FileText className="h-3 w-3" />,           cls:'bg-teal-100 text-teal-600',     label:'Диадок'      },
  PORTAL:        { icon: <AiChatIcon className="h-3 w-3" />,       cls:'bg-purple-100 text-purple-600', label:'Портал'      },
};

function ChannelBadge({ channel, label = false }: { channel: IntegrationKey; label?: boolean }) {
  const cfg = CH_CFG[channel] ?? CH_CFG['INTERNAL_CHAT'];
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium leading-none',
      cfg.cls,
    )}>
      {cfg.icon}
      {label && <span className="ml-0.5">{cfg.label}</span>}
    </span>
  );
}

// ─── Task dialog ──────────────────────────────────────────────────────────────

const PRIO_LABEL: Record<TaskPriority, string> = {
  LOW:'Низкий', MEDIUM:'Средний', HIGH:'Высокий', URGENT:'Срочно',
};

function TaskDialog({
  open, onOpenChange, quotedText, msgIds, onCreated,
}: { open:boolean; onOpenChange:(v:boolean)=>void; quotedText:string; msgIds:string[]; onCreated:()=>void }) {
  const addTask = useTaskStore((s) => s.addTask);
  const [title, setTitle]     = useState('');
  const [prio,  setPrio]      = useState<TaskPriority>('MEDIUM');
  const [due,   setDue]       = useState('');

  const submit = () => {
    if (!title.trim()) return;
    addTask({ title:title.trim(), priority:prio, status:'TODO',
              quotedText:quotedText||undefined,
              sourceMessageIds:msgIds.length?msgIds:undefined,
              dueDate:due?new Date(due):undefined });
    setTitle(''); setPrio('MEDIUM'); setDue('');
    onOpenChange(false); onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="text-sm">Создать задачу</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Название *</Label>
            <Input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Что нужно сделать?" className="h-9 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Приоритет</Label>
              <Select value={prio} onValueChange={(v)=>setPrio(v as TaskPriority)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['LOW','MEDIUM','HIGH','URGENT'] as TaskPriority[]).map((p)=>(
                    <SelectItem key={p} value={p} className="text-xs">{PRIO_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Срок</Label>
              <Input type="date" value={due} onChange={(e)=>setDue(e.target.value)} className="h-9 text-xs" />
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
          <Button variant="ghost" size="sm" onClick={()=>onOpenChange(false)}>Отмена</Button>
          <Button size="sm" onClick={submit} disabled={!title.trim()}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MsgBubble({ msg, selected, onToggle }: { msg:ChatMessage; selected:boolean; onToggle:(id:string)=>void }) {
  const isSelf = msg.senderId === 'u1' || msg.senderName === 'Бухгалтер';
  return (
    <div
      onClick={() => onToggle(msg.id)}
      className={cn(
        'group relative flex gap-2 px-4 py-1.5 cursor-pointer select-none rounded-lg transition-colors',
        isSelf ? 'flex-row-reverse' : 'flex-row',
        selected ? 'bg-blue-50' : 'hover:bg-slate-50/80',
      )}
    >
      {/* checkbox */}
      <div className={cn(
        'absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded border transition-all flex items-center justify-center',
        selected ? 'border-blue-500 bg-blue-500' : 'border-transparent group-hover:border-slate-300',
      )}>
        {selected && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
      </div>

      {/* avatar */}
      <div className={cn(
        'h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold',
        isSelf ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600',
      )}>
        {msg.senderName[0]}
      </div>

      {/* bubble */}
      <div className={cn('max-w-[68%] space-y-0.5', isSelf && 'items-end flex flex-col')}>
        <div className={cn('flex items-center gap-1.5', isSelf && 'flex-row-reverse')}>
          <ChannelBadge channel={msg.channel} />
          <span className="text-[10px] font-medium text-muted-foreground">{msg.senderName}</span>
          <span className="text-[10px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
        </div>
        <div className={cn(
          'px-3 py-2 rounded-2xl text-sm leading-snug',
          isSelf
            ? 'bg-blue-600 text-white rounded-tr-none'
            : 'bg-white border border-slate-100 shadow-sm text-slate-800 rounded-tl-none',
        )}>
          {msg.text}
        </div>
      </div>
    </div>
  );
}

// ─── Client card (sidebar) ────────────────────────────────────────────────────

function ClientCard({
  client, msgs, active, mergeMode, mergeCandidate, onSelect, onMerge,
}: {
  client:ClientContact; msgs:ChatMessage[];
  active:boolean; mergeMode:boolean; mergeCandidate:boolean;
  onSelect:()=>void; onMerge:()=>void;
}) {
  const unread = msgs.filter((m) => !m.read && !m.done && m.senderId !== 'u1').length;
  const last   = msgs.at(-1);

  return (
    <button
      onClick={mergeMode ? onMerge : onSelect}
      className={cn(
        'w-full text-left px-3 py-2.5 transition-colors flex items-start gap-2.5 border-b border-slate-50',
        active && !mergeMode  ? 'bg-slate-900' : 'hover:bg-slate-50',
        mergeCandidate        ? 'ring-2 ring-inset ring-blue-400 bg-blue-50' : '',
      )}
    >
      <div className={cn(
        'h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold',
        active && !mergeMode ? 'bg-white/20 text-white' : client.color,
      )}>
        {client.initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={cn(
            'text-xs font-medium truncate',
            active && !mergeMode ? 'text-white' : 'text-slate-800',
          )}>
            {client.shortName}
          </span>
          {unread > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center flex-shrink-0">
              {unread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {client.activeChannels.slice(0, 3).map((ch) => <ChannelBadge key={ch} channel={ch} />)}
          {last && (
            <span className={cn(
              'text-[10px] truncate ml-0.5',
              active && !mergeMode ? 'text-slate-300' : 'text-muted-foreground',
            )}>
              {last.text.slice(0, 26)}{last.text.length > 26 ? '…' : ''}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── TG adapter ──────────────────────────────────────────────────────────────

function tgToChat(m: TgApiMessage, clientId: string): ChatMessage {
  return {
    id:         m.id,
    channel:    'TG',
    senderId:   String(m.sender_id),
    senderName: m.sender_name || m.username || 'TG',
    text:       m.text,
    timestamp:  new Date(m.timestamp),
    read:       false,
    clientId,
    tgChatId:   m.chat_id,
    username:   m.username,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AccountantChat() {
  const {
    messages, selectedIds,
    addMessage, toggleSelect, clearSelection, draft, setDraft, remapClientId,
  } = useChatStore();

  const { demoMode } = useAppStore();

  const {
    clients, selectedId,
    select, addClient, updateChannelId, mergeClients,
  } = useClientStore();

  const [taskOpen,     setTaskOpen]     = useState(false);
  const [tgOnline,     setTgOnline]     = useState(false);
  const [search,       setSearch]       = useState('');
  const [mergeMode,    setMergeMode]    = useState(false);
  const [mergeTarget,  setMergeTarget]  = useState<string | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState(false);
  const knownIds  = useRef<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Reset UI on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    setMergeMode(false); setMergeTarget(null);
    knownIds.current.clear();
    clearSelection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Telegram polling (demo=OFF) ───────────────────────────────────────────
  useEffect(() => {
    if (demoMode) { setTgOnline(false); return; }
    let alive = true;

    async function poll() {
      try {
        const res  = await fetch(API.telegram.messages(200));
        if (!res.ok) return;
        const data = await res.json() as { messages: TgApiMessage[] };
        const fresh = data.messages.filter((m) => !knownIds.current.has(m.id) && m.text);
        if (!fresh.length) { if (alive) setTgOnline(true); return; }

        fresh.forEach((m) => {
          knownIds.current.add(m.id);
          // find or create client by TG chat_id
          let cid = useClientStore.getState().clients
            .find((c) => c.channelIds.TG === m.chat_id)?.id;

          if (!cid) {
            const parts   = (m.sender_name ?? m.username ?? 'TG').split(' ');
            const initials = parts.map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
            cid = addClient({
              name:           m.sender_name || m.username || `TG ${m.chat_id}`,
              shortName:      m.sender_name || m.username || `TG ${m.chat_id}`,
              initials,
              activeChannels: ['TG'],
              channelIds:     { TG: m.chat_id },
            });
          } else {
            updateChannelId(cid, 'TG', m.chat_id);
          }
          if (alive) addMessage(tgToChat(m, cid));
        });
        if (alive) setTgOnline(true);
      } catch {
        if (alive) setTgOnline(false);
      }
    }

    poll();
    const t = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const selectedClient = clients.find((c) => c.id === selectedId) ?? null;

  const msgsByClient = useMemo(() => {
    const map = new Map<string, ChatMessage[]>();
    clients.forEach((c) => map.set(c.id, []));
    messages.forEach((m) => {
      if (m.clientId) map.get(m.clientId)?.push(m);
    });
    // sort each by timestamp
    map.forEach((arr) => arr.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
    return map;
  }, [messages, clients]);

  const clientMsgs = useMemo(
    () => selectedId ? (msgsByClient.get(selectedId) ?? []) : [],
    [msgsByClient, selectedId],
  );

  const selectedMsgs = useMemo(
    () => clientMsgs.filter((m) => selectedIds.includes(m.id)),
    [clientMsgs, selectedIds],
  );

  const quote = useMemo(
    () => [...selectedMsgs]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((m) => `[${formatDate(m.timestamp)} ${formatTime(m.timestamp)} | ${m.senderName}]: ${m.text}`)
      .join('\n'),
    [selectedMsgs],
  );

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      c.name.toLowerCase().includes(q) || c.inn?.includes(q),
    );
  }, [clients, search]);

  const totalUnread = useMemo(
    () => messages.filter((m) => !m.read && m.senderId !== 'u1').length,
    [messages],
  );

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || !selectedClient) return;

    const tgChatId = !demoMode ? selectedClient.channelIds?.TG : undefined;
    const channel: IntegrationKey = tgChatId ? 'TG' : 'INTERNAL_CHAT';

    if (tgChatId) {
      try {
        await fetch(API.telegram.send(), {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ chat_id: tgChatId, text }),
        });
      } catch (e) { console.error('TG send:', e); }
    }

    addMessage({
      id:         `m-${Date.now()}`,
      channel,
      senderId:   'u1',
      senderName: 'Бухгалтер',
      text,
      timestamp:  new Date(),
      read:       true,
      clientId:   selectedClient.id,
    });
    setDraft('');
  }, [draft, selectedClient, demoMode, addMessage, setDraft]);

  // ── Merge ─────────────────────────────────────────────────────────────────
  const startMerge = (id: string) => {
    if (!selectedId || id === selectedId) return;
    setMergeTarget(id);
    setMergeConfirm(true);
  };

  const confirmMerge = () => {
    if (!selectedId || !mergeTarget) return;
    remapClientId(mergeTarget, selectedId);
    mergeClients(selectedId, mergeTarget);
    setMergeMode(false); setMergeTarget(null); setMergeConfirm(false);
  };

  const mergeTargetClient = clients.find((c) => c.id === mergeTarget);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">

      {/* ── Left: client list ── */}
      <aside className="w-60 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col">

        {/* Header */}
        <div className="p-3 border-b border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-slate-700">Клиенты</span>
              {totalUnread > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center">
                  {totalUnread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <Button size="sm" variant="ghost"
                className={cn('h-6 w-6 p-0', mergeMode && 'bg-blue-50 text-blue-600')}
                title="Объединить контакты"
                onClick={() => { setMergeMode(!mergeMode); setMergeTarget(null); }}>
                <GitMerge className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Добавить контакт">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени или ИНН..." className="h-7 pl-6 text-xs" />
          </div>

          {mergeMode && (
            <p className="text-[10px] text-blue-600 font-medium">
              Выберите контакт для объединения с «{selectedClient?.shortName}»
            </p>
          )}
        </div>

        {/* List */}
        <nav className="flex-1 overflow-y-auto">
          {filteredClients.map((c) => (
            <ClientCard
              key={c.id}
              client={c}
              msgs={msgsByClient.get(c.id) ?? []}
              active={c.id === selectedId}
              mergeMode={mergeMode && c.id !== selectedId}
              mergeCandidate={c.id === mergeTarget}
              onSelect={() => { select(c.id); clearSelection(); setSearch(''); }}
              onMerge={() => startMerge(c.id)}
            />
          ))}
          {filteredClients.length === 0 && (
            <p className="text-xs text-muted-foreground text-center p-4">Нет контактов</p>
          )}
        </nav>

        {/* TG status */}
        {!demoMode && (
          <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-1.5">
            {tgOnline
              ? <><Wifi className="h-3 w-3 text-emerald-500" /><span className="text-[10px] text-emerald-600 font-medium">Telegram Live</span></>
              : <><WifiOff className="h-3 w-3 text-slate-400" /><span className="text-[10px] text-slate-400">Telegram offline</span></>}
          </div>
        )}
      </aside>

      {/* ── Right: conversation ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedClient ? (
          <>
            {/* Header */}
            <div className="bg-white border-b border-slate-100 px-4 py-2.5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className={cn('h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0', selectedClient.color)}>
                  {selectedClient.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{selectedClient.name}</p>
                    {selectedClient.activeChannels.map((ch) => (
                      <ChannelBadge key={ch} channel={ch} label />
                    ))}
                    {clientMsgs.filter((m) => !m.read).length > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {clientMsgs.filter((m) => !m.read).length} непрочит.
                      </Badge>
                    )}
                  </div>
                  {selectedClient.inn && (
                    <p className="text-[10px] text-muted-foreground">ИНН {selectedClient.inn}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Selection bar */}
            {selectedIds.length > 0 && (
              <div className="bg-blue-600 text-white px-4 py-2 flex items-center gap-3 text-xs flex-shrink-0">
                <CheckSquare className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="font-medium flex-1">Выбрано: {selectedIds.length}</span>
                <Button size="sm" variant="secondary"
                  className="h-7 text-xs bg-white text-blue-700 hover:bg-blue-50"
                  onClick={() => setTaskOpen(true)}>
                  <ClipboardList className="mr-1.5 h-3 w-3" />
                  Создать задачу
                </Button>
                <button onClick={clearSelection} className="p-1 rounded hover:bg-blue-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-3 space-y-0.5">
              {clientMsgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-xs text-muted-foreground">
                  <MessageSquare className="h-10 w-10 text-slate-100" />
                  <p>Нет сообщений</p>
                  <p className="text-[10px]">Напишите первым или дождитесь сообщения от клиента</p>
                </div>
              ) : (
                clientMsgs.map((m) => (
                  <MsgBubble
                    key={m.id}
                    msg={m}
                    selected={selectedIds.includes(m.id)}
                    onToggle={toggleSelect}
                  />
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="bg-white border-t border-slate-100 px-3 py-2.5 flex items-end gap-2 flex-shrink-0">
              <div className="flex-shrink-0 pb-2">
                {!demoMode && selectedClient.channelIds?.TG
                  ? <TelegramIcon className="h-3.5 w-3.5 text-sky-500" />
                  : <MessageSquare className="h-3.5 w-3.5 text-slate-300" />}
              </div>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={`Сообщение для ${selectedClient.shortName}... (Enter — отправить)`}
                className="flex-1 min-h-[36px] max-h-28 text-sm resize-none"
                rows={1}
              />
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!draft.trim()}
                className="h-9 w-9 p-0 flex-shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-slate-100 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Выберите клиента</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}
      <TaskDialog
        open={taskOpen} onOpenChange={setTaskOpen}
        quotedText={quote} msgIds={[...selectedIds]} onCreated={clearSelection}
      />

      <Dialog open={mergeConfirm} onOpenChange={setMergeConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Объединить контакты</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">
            Все сообщения <strong>{mergeTargetClient?.name}</strong> будут перенесены
            в чат <strong>{selectedClient?.name}</strong>. Контакт «{mergeTargetClient?.shortName}» будет удалён.
          </p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { setMergeConfirm(false); setMergeTarget(null); }}>
              Отмена
            </Button>
            <Button size="sm" onClick={confirmMerge}>Объединить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
