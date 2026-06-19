'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import {
  BarChart3, MessageSquare, CheckSquare, Users, ArrowRight, Clock,
} from 'lucide-react';
import { useChatStore }   from '@/store/useChatStore';
import { useClientStore } from '@/store/useClientStore';
import { useTaskStore }   from '@/store/useTaskStore';
import { cn, formatTime } from '@/lib/utils';

export function PulseBoard() {
  const messages = useChatStore((s) => s.messages);
  const clients  = useClientStore((s) => s.clients);
  const tasks    = useTaskStore((s) => s.tasks);

  const activeTasks  = useMemo(() => tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED'), [tasks]);
  const unprocessed  = useMemo(() => messages.filter((m) => !m.done && m.senderId !== 'u1'), [messages]);

  const chatGroups = useMemo(() => {
    return clients.map((c) => {
      const msgs   = messages.filter((m) => m.clientId === c.id);
      const unread = msgs.filter((m) => !m.read && !m.done && m.senderId !== 'u1').length;
      const unproc = msgs.filter((m) => !m.done && m.senderId !== 'u1');
      const oldest = unproc.length > 0
        ? Math.min(...unproc.map((m) => new Date(m.timestamp).getTime()))
        : Infinity;
      return { client: c, unread, oldest, last: msgs.at(-1) };
    })
      .filter((g) => g.last)
      .sort((a, b) => a.oldest - b.oldest);
  }, [clients, messages]);

  const activeChatCount = chatGroups.filter((g) => g.oldest < Infinity).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Пульс компании</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Сводка по рабочему месту бухгалтера</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard href="/clients"   icon={Users}         label="Клиентов"       value={clients.length}        color="blue" />
        <StatCard href="/chats"     icon={MessageSquare} label="Активных чатов" value={activeChatCount}       color="violet" />
        <StatCard href="/tasks"     icon={CheckSquare}   label="Задач в работе" value={activeTasks.length}    color="orange" />
        <StatCard                   icon={Clock}         label="Необработанных" value={unprocessed.length}    color="red" />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-2 gap-6">
        {/* Chats */}
        <Section title="Чаты с клиентами" href="/chats" linkLabel="Все чаты">
          {chatGroups.length === 0
            ? <Empty text="Нет сообщений" />
            : chatGroups.slice(0, 6).map(({ client, unread, oldest, last }) => (
              <Link key={client.id} href={`/clients/${client.id}`}
                className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                <div className={cn('h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold', client.color)}>
                  {client.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{client.shortName}</p>
                  <p className="text-xs text-muted-foreground truncate">{last?.text ?? '—'}</p>
                </div>
                {unread > 0 && (
                  <span className="h-5 min-w-[20px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 flex-shrink-0">
                    {unread}
                  </span>
                )}
                {oldest < Infinity && (
                  <span className="text-[10px] text-amber-500 flex-shrink-0 whitespace-nowrap">
                    с {formatTime(new Date(oldest))}
                  </span>
                )}
              </Link>
            ))
          }
        </Section>

        {/* Tasks */}
        <Section title="Задачи в работе" href="/tasks" linkLabel="Все задачи">
          {activeTasks.length === 0
            ? <Empty text="Нет активных задач" />
            : activeTasks.slice(0, 6).map((task) => {
              const client = clients.find((c) => c.id === task.clientId);
              return (
                <div key={task.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <PriorityDot priority={task.priority} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 truncate">{task.title}</p>
                    {client && <p className="text-[11px] text-muted-foreground">{client.shortName}</p>}
                  </div>
                  <StatusBadge status={task.status} />
                </div>
              );
            })
          }
        </Section>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, href }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; color: string; href?: string;
}) {
  const C: Record<string, { bg: string; text: string; num: string }> = {
    blue:   { bg:'bg-blue-50',   text:'text-blue-600',   num:'text-blue-900' },
    violet: { bg:'bg-violet-50', text:'text-violet-600', num:'text-violet-900' },
    orange: { bg:'bg-orange-50', text:'text-orange-600', num:'text-orange-900' },
    red:    { bg:'bg-red-50',    text:'text-red-600',    num:'text-red-900' },
  };
  const c = C[color] ?? C.blue;
  const inner = (
    <div className={cn('rounded-xl p-4 space-y-2 hover:opacity-90 transition-opacity', c.bg)}>
      <Icon className={cn('h-5 w-5', c.text)} />
      <p className={cn('text-2xl font-bold', c.num)}>{value}</p>
      <p className={cn('text-xs font-medium', c.text)}>{label}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : <div>{inner}</div>;
}

function Section({ title, href, linkLabel, children }: {
  title: string; href: string; linkLabel: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <Link href={href} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          {linkLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-xs text-muted-foreground text-center">{text}</p>;
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    URGENT: 'bg-red-500', HIGH: 'bg-orange-400', MEDIUM: 'bg-yellow-400', LOW: 'bg-slate-300',
  };
  return <div className={cn('h-2 w-2 rounded-full flex-shrink-0', colors[priority] ?? 'bg-slate-300')} />;
}

function StatusBadge({ status }: { status: string }) {
  const C: Record<string, string> = {
    TODO: 'bg-slate-100 text-slate-600',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    DONE: 'bg-emerald-100 text-emerald-700',
  };
  const L: Record<string, string> = { TODO: 'К сделать', IN_PROGRESS: 'В работе', DONE: 'Готово' };
  return (
    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0', C[status] ?? C.TODO)}>
      {L[status] ?? status}
    </span>
  );
}
