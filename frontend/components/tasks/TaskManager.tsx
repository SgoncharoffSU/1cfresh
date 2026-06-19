'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, ChevronDown, ChevronRight, Trash2,
  CalendarDays, MessageSquareQuote, User, ExternalLink, GripVertical,
} from 'lucide-react';
import { Button }      from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input }       from '@/components/ui/input';
import { Label }       from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea }    from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTaskStore }   from '@/store/useTaskStore';
import { useClientStore } from '@/store/useClientStore';
import { useChatStore }   from '@/store/useChatStore';
import { Task, TaskPriority, TaskStatus } from '@/types';
import { cn, formatDate, formatTime, formatDateTime, isOverdue } from '@/lib/utils';

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<TaskStatus, { label: string; cls: string; dot: string }> = {
  TODO:        { label: 'К выполнению', cls: 'bg-slate-100 text-slate-700',    dot: 'bg-slate-400'    },
  IN_PROGRESS: { label: 'В работе',     cls: 'bg-blue-100 text-blue-700',      dot: 'bg-blue-500'     },
  DONE:        { label: 'Готово',       cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500'  },
  CANCELLED:   { label: 'Отменено',     cls: 'bg-slate-100 text-slate-400',    dot: 'bg-slate-300'    },
};

const PRIORITY_CFG: Record<TaskPriority, { label: string; cls: string }> = {
  LOW:    { label: 'Низкий',  cls: 'bg-slate-100 text-slate-500'          },
  MEDIUM: { label: 'Средний', cls: 'bg-yellow-100 text-yellow-700'        },
  HIGH:   { label: 'Высокий', cls: 'bg-orange-100 text-orange-700'        },
  URGENT: { label: 'Срочно',  cls: 'bg-red-100 text-red-700 font-semibold' },
};

const ALL_STATUSES:   TaskStatus[]  = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
const ALL_PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

// ─── Drag ghost ───────────────────────────────────────────────────────────────

function DragGhost({ task, x, y }: { task: Task; x: number; y: number }) {
  return (
    <div
      style={{ position: 'fixed', left: x + 14, top: y - 12, pointerEvents: 'none', zIndex: 9999, width: 230 }}
      className="rounded-lg border border-blue-300 bg-white shadow-2xl p-3 rotate-1 opacity-95"
    >
      <div className="flex items-start gap-2">
        <span className={cn('mt-0.5 px-1.5 py-0 rounded text-[10px] font-medium flex-shrink-0', PRIORITY_CFG[task.priority].cls)}>
          {PRIORITY_CFG[task.priority].label}
        </span>
        <p className="text-sm font-medium leading-snug text-slate-800 line-clamp-2">{task.title}</p>
      </div>
      {task.dueDate && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400">
          <CalendarDays className="h-2.5 w-2.5" />
          {formatDate(task.dueDate)}
        </div>
      )}
    </div>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ task, isDragging, onGripPointerDown }: {
  task: Task;
  isDragging: boolean;
  onGripPointerDown: (e: React.PointerEvent, id: string) => void;
}) {
  const { updateTask, deleteTask } = useTaskStore();
  const { clients }                = useClientStore();
  const { messages }               = useChatStore();
  const router                     = useRouter();
  const [quoteOpen, setQuoteOpen]  = useState(false);
  const [editOpen,  setEditOpen]   = useState(false);

  const client = task.clientId ? clients.find((c) => c.id === task.clientId) : null;
  const over   = task.dueDate && isOverdue(task.dueDate)
    && task.status !== 'DONE' && task.status !== 'CANCELLED';

  const msgById = useMemo(
    () => Object.fromEntries(messages.map((m) => [m.id, m])),
    [messages],
  );

  const goToChat = (focusId?: string) => {
    if (!task.clientId) return;
    const params = new URLSearchParams({ client: task.clientId });
    if (task.sourceMessageIds?.length) params.set('highlight', task.sourceMessageIds.join(','));
    if (focusId) params.set('focus', focusId);
    router.push(`/chats?${params.toString()}`);
  };

  return (
    <Card
      onClick={() => setEditOpen(true)}
      className={cn(
        'border shadow-none transition-all hover:shadow-sm select-none cursor-pointer',
        isDragging ? 'opacity-30 scale-[0.97]' : 'opacity-100',
        task.status === 'DONE'      && !isDragging && 'opacity-60',
        task.status === 'CANCELLED' && !isDragging && 'opacity-40',
      )}
    >
      <CardContent className="p-3 space-y-2">

        <div className="flex items-start gap-1.5">
          {/* Drag handle */}
          <div
            onPointerDown={(e) => onGripPointerDown(e, task.id)}
            className="mt-0.5 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none p-0.5 text-slate-300 hover:text-slate-500 transition-colors"
            title="Перетащить"
          >
            <GripVertical className="h-4 w-4" />
          </div>

          <span className={cn('mt-0.5 px-1.5 py-0 rounded text-[10px] font-medium flex-shrink-0', PRIORITY_CFG[task.priority].cls)}>
            {PRIORITY_CFG[task.priority].label}
          </span>
          <p className={cn('flex-1 text-sm font-medium leading-snug', task.status === 'DONE' && 'line-through text-muted-foreground')}>
            {task.title}
          </p>
          <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
            className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0 p-0.5">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div onClick={(e) => e.stopPropagation()}>
            <Select value={task.status} onValueChange={(v) => updateTask(task.id, { status: v as TaskStatus })}>
              <SelectTrigger className={cn('h-6 text-[11px] w-auto px-2 border-0 rounded-full', STATUS_CFG[task.status].cls)}>
                <span className={cn('inline-block h-1.5 w-1.5 rounded-full mr-1.5', STATUS_CFG[task.status].dot)} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{STATUS_CFG[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {task.dueDate && (() => {
            const dt = new Date(task.dueDate);
            const hasTime = dt.getHours() !== 0 || dt.getMinutes() !== 0;
            return (
              <span className={cn('flex items-center gap-1 text-[11px]', over ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
                <CalendarDays className="h-3 w-3" />
                {hasTime ? formatDateTime(task.dueDate) : formatDate(task.dueDate)}
                {over && ' · просрочено'}
              </span>
            );
          })()}

          {client && (
            <button onClick={(e) => { e.stopPropagation(); goToChat(); }}
              className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 transition-colors"
              title="Открыть чат">
              <User className="h-3 w-3" />
              {client.shortName}
              <ExternalLink className="h-2.5 w-2.5 opacity-60" />
            </button>
          )}

          {(task.sourceMessageIds?.length ?? 0) > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setQuoteOpen((o) => !o); }}
              className="flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 transition-colors">
              <MessageSquareQuote className="h-3 w-3" />
              {task.sourceMessageIds!.length} сообщений
              {quoteOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
        </div>

        {quoteOpen && (
          <div className="rounded-lg border border-violet-100 bg-violet-50 divide-y divide-violet-100 overflow-hidden">
            {(task.sourceMessageIds?.length ?? 0) > 0 ? (
              task.sourceMessageIds!.map((id) => {
                const msg = msgById[id];
                return (
                  <button
                    key={id}
                    onClick={(e) => { e.stopPropagation(); goToChat(id); }}
                    title="Открыть в чате"
                    className="w-full text-left flex items-start gap-2 px-3 py-2 hover:bg-violet-100 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      {msg ? (
                        <>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10px] font-semibold text-violet-600">{msg.senderName}</span>
                            <span className="text-[10px] text-violet-400">{formatTime(new Date(msg.timestamp))}</span>
                          </div>
                          <p className="text-[11px] text-violet-900 leading-snug">{msg.text}</p>
                        </>
                      ) : (
                        <p className="text-[11px] text-violet-500 italic">Перейти к сообщению в чате</p>
                      )}
                    </div>
                    <ExternalLink className="flex-shrink-0 h-3 w-3 mt-0.5 text-violet-300 group-hover:text-violet-600 transition-colors" />
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2">
                <pre className="text-[11px] whitespace-pre-wrap font-sans text-violet-800 leading-relaxed">{task.quotedText}</pre>
              </div>
            )}
          </div>
        )}

        {task.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">{task.description}</p>
        )}
      </CardContent>

      <EditTaskDialog task={task} open={editOpen} onOpenChange={setEditOpen} />
    </Card>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({ status, items, isOver, colRef, dragTaskId, onGripPointerDown }: {
  status: TaskStatus;
  items: Task[];
  isOver: boolean;
  colRef: (el: HTMLDivElement | null) => void;
  dragTaskId: string | null;
  onGripPointerDown: (e: React.PointerEvent, id: string) => void;
}) {
  return (
    <div
      ref={colRef}
      className={cn(
        'rounded-xl p-2 min-h-[80px] transition-colors space-y-2',
        isOver && dragTaskId ? 'bg-blue-50 ring-2 ring-blue-300 ring-inset' : 'bg-transparent',
      )}
    >
      <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
        <span className={cn('h-2 w-2 rounded-full flex-shrink-0', STATUS_CFG[status].dot)} />
        <span className="text-xs font-semibold text-slate-700">{STATUS_CFG[status].label}</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className={cn(
          'text-xs text-center py-6 rounded-lg border-2 border-dashed transition-colors',
          isOver && dragTaskId ? 'text-blue-400 border-blue-300' : 'text-muted-foreground/40 border-transparent',
        )}>
          {isOver && dragTaskId ? 'Перетащите сюда' : '—'}
        </p>
      ) : (
        items.map((t) => (
          <TaskCard key={t.id} task={t} isDragging={t.id === dragTaskId} onGripPointerDown={onGripPointerDown} />
        ))
      )}
    </div>
  );
}

// ─── Create dialog ────────────────────────────────────────────────────────────

function CreateTaskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const addTask = useTaskStore((s) => s.addTask);
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [priority,    setPriority]    = useState<TaskPriority>('MEDIUM');
  const [due,         setDue]         = useState('');
  const [dueTime,     setDueTime]     = useState('');

  const reset = () => { setTitle(''); setDescription(''); setPriority('MEDIUM'); setDue(''); setDueTime(''); };

  const handleSubmit = () => {
    if (!title.trim()) return;
    let dueDate: Date | undefined;
    if (due) dueDate = new Date(`${due}T${dueTime || '00:00'}`);
    addTask({ title: title.trim(), description: description.trim() || undefined, priority, status: 'TODO', dueDate });
    reset(); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-sm">Новая задача</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Название *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Что нужно сделать?" className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Описание</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Дополнительные детали..." className="text-sm min-h-[72px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Приоритет</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">{PRIORITY_CFG[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Крайний срок</Label>
              <div className="flex gap-1.5">
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 text-xs flex-1 min-w-0" />
                <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!due} className="h-9 text-xs w-24 flex-shrink-0" />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => { reset(); onOpenChange(false); }}>Отмена</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!title.trim()}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit dialog ──────────────────────────────────────────────────────────────

const toDateInput = (d: Date) => {
  const da = new Date(d);
  return `${da.getFullYear()}-${String(da.getMonth() + 1).padStart(2, '0')}-${String(da.getDate()).padStart(2, '0')}`;
};
const toTimeInput = (d: Date) => {
  const da = new Date(d);
  return `${String(da.getHours()).padStart(2, '0')}:${String(da.getMinutes()).padStart(2, '0')}`;
};

function EditTaskDialog({ task, open, onOpenChange }: {
  task: Task; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const updateTask = useTaskStore((s) => s.updateTask);
  const [title,       setTitle]       = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority,    setPriority]    = useState<TaskPriority>(task.priority);
  const [status,      setStatus]      = useState<TaskStatus>(task.status);
  const [due,         setDue]         = useState(task.dueDate ? toDateInput(new Date(task.dueDate)) : '');
  const [dueTime,     setDueTime]     = useState(task.dueDate ? toTimeInput(new Date(task.dueDate)) : '');

  // Re-sync from the task whenever the dialog opens — a card can be edited again
  // after its fields changed elsewhere (e.g. status updated from the inline select).
  useEffect(() => {
    if (!open) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setPriority(task.priority);
    setStatus(task.status);
    setDue(task.dueDate ? toDateInput(new Date(task.dueDate)) : '');
    setDueTime(task.dueDate ? toTimeInput(new Date(task.dueDate)) : '');
  }, [open, task]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    const dueDate = due ? new Date(`${due}T${dueTime || '00:00'}`) : undefined;
    updateTask(task.id, {
      title: title.trim(), description: description.trim() || undefined, priority, status, dueDate,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle className="text-sm">Редактировать задачу</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Название *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Что нужно сделать?" className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Описание</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Дополнительные детали..." className="text-sm min-h-[72px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Приоритет</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">{PRIORITY_CFG[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Статус</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">{STATUS_CFG[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Крайний срок</Label>
            <div className="flex gap-1.5">
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 text-xs flex-1 min-w-0" />
              <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!due} className="h-9 text-xs w-24 flex-shrink-0" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!title.trim()}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TaskManager() {
  const { tasks, updateTask } = useTaskStore();
  const [statusFilter,   setStatusFilter]   = useState<TaskStatus | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'ALL'>('ALL');
  const [createOpen,     setCreateOpen]     = useState(false);

  // Pointer-based DnD state
  const [dragState, setDragState] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);
  const overStatusRef = useRef<TaskStatus | null>(null);
  const colRefs = useRef<Partial<Record<TaskStatus, HTMLDivElement | null>>>({});

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (statusFilter   !== 'ALL') list = list.filter((t) => t.status   === statusFilter);
    if (priorityFilter !== 'ALL') list = list.filter((t) => t.priority === priorityFilter);
    const PRI_ORD: Record<TaskPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    list.sort((a, b) => PRI_ORD[a.priority] - PRI_ORD[b.priority] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }, [tasks, statusFilter, priorityFilter]);

  const byStatus = useMemo(() =>
    ALL_STATUSES.map((s) => ({ status: s, items: filtered.filter((t) => t.status === s) })),
    [filtered],
  );

  const counts = useMemo(() => ({
    total:    tasks.length,
    fromChat: tasks.filter((t) => t.sourceMessageIds && t.sourceMessageIds.length > 0).length,
    overdue:  tasks.filter((t) => isOverdue(t.dueDate) && t.status !== 'DONE' && t.status !== 'CANCELLED').length,
  }), [tasks]);

  // Attach global pointer listeners while dragging
  useEffect(() => {
    if (!dragState) return;

    const onMove = (e: PointerEvent) => {
      setDragState((d) => d ? { ...d, x: e.clientX, y: e.clientY } : null);

      let found: TaskStatus | null = null;
      for (const s of ALL_STATUSES) {
        const el = colRefs.current[s];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          found = s;
          break;
        }
      }
      overStatusRef.current = found;
      setOverStatus(found);
    };

    const onUp = () => {
      const target = overStatusRef.current;
      if (dragState && target) {
        const task = tasks.find((t) => t.id === dragState.taskId);
        if (task && task.status !== target) updateTask(dragState.taskId, { status: target });
      }
      setDragState(null);
      setOverStatus(null);
      overStatusRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState?.taskId]);

  const handleGripPointerDown = (e: React.PointerEvent, taskId: string) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({ taskId, x: e.clientX, y: e.clientY });
  };

  const draggedTask = dragState ? tasks.find((t) => t.id === dragState.taskId) : null;

  return (
    <div className="p-6 space-y-5 max-w-screen-xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Задачник</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {counts.total} задач · {counts.fromChat} из чата · {counts.overdue} просрочено
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="h-8 text-xs">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Создать задачу
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Статус</p>
          <ToggleGroup type="single" value={statusFilter}
            onValueChange={(v) => setStatusFilter((v || 'ALL') as TaskStatus | 'ALL')} className="gap-1">
            <ToggleGroupItem value="ALL" className="h-7 px-2 text-xs">Все</ToggleGroupItem>
            {ALL_STATUSES.map((s) => (
              <ToggleGroupItem key={s} value={s} className="h-7 px-2 text-xs">{STATUS_CFG[s].label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Приоритет</p>
          <ToggleGroup type="single" value={priorityFilter}
            onValueChange={(v) => setPriorityFilter((v || 'ALL') as TaskPriority | 'ALL')} className="gap-1">
            <ToggleGroupItem value="ALL" className="h-7 px-2 text-xs">Все</ToggleGroupItem>
            {ALL_PRIORITIES.map((p) => (
              <ToggleGroupItem key={p} value={p} className="h-7 px-2 text-xs">{PRIORITY_CFG[p].label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {/* Kanban */}
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-muted-foreground">Задач пока нет</p>
          <p className="text-xs text-muted-foreground mt-1">Создайте задачу вручную или выберите сообщения в чате</p>
          <Button size="sm" variant="outline" className="mt-4 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Первая задача
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {byStatus.map(({ status, items }) => (
            <KanbanColumn
              key={status}
              status={status}
              items={items}
              isOver={overStatus === status}
              colRef={(el) => { colRefs.current[status] = el; }}
              dragTaskId={dragState?.taskId ?? null}
              onGripPointerDown={handleGripPointerDown}
            />
          ))}
        </div>
      )}

      {/* Custom drag ghost */}
      {dragState && draggedTask && (
        <DragGhost task={draggedTask} x={dragState.x} y={dragState.y} />
      )}

      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
