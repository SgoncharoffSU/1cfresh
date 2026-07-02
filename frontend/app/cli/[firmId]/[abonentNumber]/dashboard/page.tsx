'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  MessageSquare, CheckSquare, FileText, LogOut, Send, Globe,
} from 'lucide-react';
import { Button }   from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LogoIcon } from '@/components/icons/LogoIcon';
import { ThemeToggle } from '@/components/ThemeToggle';
import { usePortalAuthStore } from '@/store/usePortalAuthStore';
import { API, apiFetchPortal } from '@/lib/api';
import { cn, formatTime, formatDate } from '@/lib/utils';

type Tab = 'chat' | 'tasks' | 'docs';

interface PortalMsg {
  id:          number;
  direction:   'inbound' | 'outbound';
  sender_name: string | null;
  text:        string;
  timestamp:   string;
}

interface PortalDoc {
  ref_key:   string;
  number:    string;
  doc_type:  string;
  date:      string | null;
  amount:    number;
  is_posted: boolean;
}

const DOC_LABEL: Record<string, string> = {
  INVOICE: 'Счёт на оплату',
  SALE:    'Реализация',
};

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'chat',  label: 'Чат',       icon: MessageSquare },
  { id: 'tasks', label: 'Задачи',    icon: CheckSquare   },
  { id: 'docs',  label: 'Документы', icon: FileText      },
];

function ComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
      <CheckSquare className="h-12 w-12 text-slate-100" />
      <p className="text-sm font-medium">Задачи появятся здесь</p>
      <span className="text-xs bg-amber-50 text-amber-600 border border-amber-100 px-3 py-1.5 rounded-full font-medium">Скоро</span>
    </div>
  );
}

export default function PortalDashboardPage() {
  const router = useRouter();
  const { firmId: firmIdParam } = useParams<{ firmId: string }>();
  const { clientId, clientName, logout, _hasHydrated } = usePortalAuthStore();

  // ── Tab — persisted across refreshes ──────────────────────────────────────
  const [tab, setTab] = useState<Tab>('chat');
  useEffect(() => {
    const saved = sessionStorage.getItem('portal-tab') as Tab | null;
    if (saved && ['chat', 'tasks', 'docs'].includes(saved)) setTab(saved);
  }, []);
  const handleTab = useCallback((t: Tab) => {
    setTab(t);
    sessionStorage.setItem('portal-tab', t);
  }, []);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const [chatMsgs, setChatMsgs] = useState<PortalMsg[]>([]);
  const [draft,    setDraft]    = useState('');
  const [sending,  setSending]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await apiFetchPortal(API.portal.chatHistory());
        if (res.ok && active) {
          const data = await res.json();
          setChatMsgs(data.messages ?? []);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3_000);
    return () => { active = false; clearInterval(id); };
  }, [clientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatMsgs.length]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || !clientId || sending) return;
    setSending(true);
    setDraft('');
    try {
      await apiFetchPortal(API.portal.chatSend(), {
        method: 'POST',
        body:   JSON.stringify({ text }),
      });
      const res = await apiFetchPortal(API.portal.chatHistory());
      if (res.ok) setChatMsgs((await res.json()).messages ?? []);
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  }, [draft, clientId, sending]);

  // ── Documents ─────────────────────────────────────────────────────────────
  const [docs,     setDocs]     = useState<PortalDoc[]>([]);
  const [docsLoad, setDocsLoad] = useState(false);

  useEffect(() => {
    if (tab !== 'docs' || !clientId) return;
    setDocsLoad(true);
    apiFetchPortal(API.portal.documents())
      .then((r) => r.json())
      .then((d) => setDocs(d.documents ?? []))
      .catch(() => {})
      .finally(() => setDocsLoad(false));
  }, [tab, clientId]);

  // ── Auth guard ────────────────────────────────────────────────────────────
  // (the layout already redirects on firmId/abonentNumber mismatch — this covers
  // the plain "never logged in" case for this page specifically)
  useEffect(() => {
    if (_hasHydrated && !clientId) router.replace(`/cli/${firmIdParam}/login`);
  }, [_hasHydrated, clientId, router, firmIdParam]);

  if (!_hasHydrated || !clientId) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-8 w-8 rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-slate-600 dark:border-t-slate-300 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoIcon className="h-7 w-auto" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white leading-none">Клиентский портал</p>
              {clientName && <p className="text-[11px] text-muted-foreground truncate max-w-[180px] mt-0.5">{clientName}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => { logout(); router.push(`/cli/${firmIdParam}/login`); }}
              className="text-xs text-muted-foreground gap-1.5">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4">
        <div className="max-w-3xl mx-auto flex">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => handleTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                tab === id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
              )}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        <div className="max-w-3xl mx-auto h-full flex flex-col">

          {/* ── Chat ── */}
          {tab === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-3">
                {chatMsgs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                    <Globe className="h-12 w-12 text-slate-100" />
                    <p className="text-sm">Напишите нам — мы ответим здесь</p>
                  </div>
                ) : (
                  chatMsgs.map((msg) => {
                    const isClient = msg.direction === 'inbound';
                    return (
                      <div key={msg.id} className={cn('flex', isClient ? 'justify-end' : 'justify-start')}>
                        <div className={cn(
                          'max-w-[78%] rounded-2xl px-4 py-2.5 shadow-sm',
                          isClient
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-sm',
                        )}>
                          {!isClient && (
                            <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-0.5">
                              {msg.sender_name || 'Бухгалтер'}
                            </p>
                          )}
                          <p className="text-sm leading-snug whitespace-pre-wrap break-words">{msg.text}</p>
                          <p className={cn('text-[10px] mt-1 text-right', isClient ? 'text-white/50' : 'text-slate-400 dark:text-slate-500')}>
                            {formatTime(new Date(msg.timestamp))}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="flex-shrink-0 border-t border-slate-100 dark:border-slate-800 px-4 py-3 bg-white dark:bg-slate-900 flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Написать сообщение…"
                  className="flex-1 min-h-[40px] max-h-24 text-sm resize-none"
                  rows={1}
                />
                <Button size="sm" onClick={handleSend} disabled={!draft.trim() || sending}
                  className="h-10 w-10 p-0 flex-shrink-0">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Tasks ── */}
          {tab === 'tasks' && <ComingSoon />}

          {/* ── Documents ── */}
          {tab === 'docs' && (
            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-5">
              {docsLoad ? (
                <div className="flex justify-center py-16">
                  <div className="h-7 w-7 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
                </div>
              ) : docs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <FileText className="h-12 w-12 text-slate-100" />
                  <p className="text-sm">Документов пока нет</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {docs.map((doc) => (
                    <div key={doc.ref_key}
                      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 px-4 py-3.5 flex items-center gap-3">
                      <div className={cn(
                        'h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0',
                        doc.is_posted ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-slate-50 dark:bg-slate-800',
                      )}>
                        <FileText className={cn('h-4 w-4', doc.is_posted ? 'text-emerald-500' : 'text-slate-400')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {DOC_LABEL[doc.doc_type] ?? doc.doc_type} №{doc.number}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {doc.date ? formatDate(new Date(doc.date)) : '—'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {doc.amount.toLocaleString('ru-RU', { minimumFractionDigits: 0 })} ₽
                        </p>
                        <span className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                          doc.is_posted ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
                        )}>
                          {doc.is_posted ? 'Проведён' : 'Черновик'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
