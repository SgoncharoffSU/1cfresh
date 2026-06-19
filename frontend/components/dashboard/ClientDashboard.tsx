'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel,
  getSortedRowModel, SortingState, useReactTable,
} from '@tanstack/react-table';
import {
  ArrowUpDown, Eye, FileText, TrendingUp, Clock,
  AlertTriangle, CheckCircle2, Circle, Trash2, RefreshCw, Mail,
} from 'lucide-react';
import { TelegramIcon } from '@/components/icons/TelegramIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuCheckboxItem,
  DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDocumentStore } from '@/store/useDocumentStore';
import { REAL_CLIENT } from '@/constants/client';
import { API } from '@/lib/api';
import { DocumentRegistry, DocumentStatus, DocumentType, IntegrationKey, WidgetKey } from '@/types';
import { cn, formatCurrency, formatDate, isOverdue } from '@/lib/utils';
import { InvoicePanel, ApiDocFull } from '@/components/dashboard/InvoicePanel';

// ─── Config maps ─────────────────────────────────────────────────────────────

const CHANNEL_ICON: Record<string, JSX.Element> = {
  TG:    <TelegramIcon className="h-3 w-3" />,
  EMAIL: <Mail className="h-3 w-3" />,
};

const TYPE_LABEL: Record<DocumentType, string> = {
  INVOICE: 'Счёт', ACT: 'Акт', UPD: 'УПД', CONTRACT: 'Договор', BILL: 'Счёт-ф.',
};

const WIDGET_LABEL: Record<WidgetKey, string> = {
  stats: 'Статистика', documents: 'Реестр документов', integrations: 'Интеграции',
};

// ─── Columns ──────────────────────────────────────────────────────────────────

const columns: ColumnDef<DocumentRegistry>[] = [
  {
    accessorKey: 'number',
    header: ({ column }) => (
      <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        Номер <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const del = row.original.deletion_mark;
      return (
        <span className={cn('font-mono text-xs font-medium', del && 'line-through text-slate-400')}>
          {row.getValue('number')}
        </span>
      );
    },
  },
  {
    accessorKey: 'type',
    header: 'Тип',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{TYPE_LABEL[row.getValue('type') as DocumentType]}</span>
    ),
  },
  {
    id: 'status',
    header: 'Статус',
    cell: ({ row }) => {
      const doc = row.original;
      return (
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
              {CHANNEL_ICON[doc.sent_via] ?? null} Отправлен
            </span>
          )}
        </div>
      );
    },
  },
  {
    id: 'counterparty',
    accessorFn: (row) => row.counterparty.name,
    header: 'Контрагент',
    cell: ({ row }) => (
      <div className="min-w-[140px]">
        <p className="text-xs font-medium truncate max-w-[180px]">{row.original.counterparty.name}</p>
        {row.original.counterparty.inn && (
          <p className="text-xs text-muted-foreground">ИНН {row.original.counterparty.inn}</p>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => (
      <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        Сумма <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs font-semibold tabular-nums">
        {formatCurrency(row.getValue('amount'))}
      </span>
    ),
  },
  {
    accessorKey: 'date',
    header: 'Дата',
    cell: ({ row }) => {
      const d: Date | null = row.getValue('date');
      if (!d) return <span className="text-xs text-muted-foreground">—</span>;
      return (
        <span className="text-xs tabular-nums">
          {d.toLocaleString('ru-RU', {
            day:'2-digit', month:'2-digit', year:'numeric',
            hour:'2-digit', minute:'2-digit',
          })}
        </span>
      );
    },
  },
  {
    accessorKey: 'dueDate',
    header: 'Срок',
    cell: ({ row }) => {
      const dd = row.original.dueDate;
      if (!dd) return <span className="text-xs text-muted-foreground">—</span>;
      const over = isOverdue(dd) && row.original.status !== 'SIGNED';
      return (
        <span className={cn('text-xs', over && 'text-red-600 font-semibold')}>
          {formatDate(dd)}
        </span>
      );
    },
  },
];

// ─── API type ──────────────────────────────────────────────────────────────────

function apiDocToRegistry(d: ApiDocFull): DocumentRegistry {
  const docType: DocumentType = d.type === 'INVOICE' ? 'INVOICE' : 'ACT';
  const date = d.date ? new Date(d.date) : new Date();
  return {
    id:             d.id,
    number:         d.number,
    type:           docType,
    status:         d.status as DocumentStatus,
    is_posted:      d.is_posted,
    deletion_mark:  d.deletion_mark,
    sent_via:       d.sent_via,
    counterparty:   { id: d.counterparty.id, name: d.counterparty.name, inn: d.counterparty.inn, companyId: 'co1' },
    counterpartyId: d.counterparty.id,
    amount:         d.amount,
    currency:       d.currency,
    date,
    createdAt:      date,
    updatedAt:      new Date(d.synced_at),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientDashboard() {
  const { integrations, widgetVisibility, toggleIntegration, toggleWidgetVisibility } = useDocumentStore();

  const [rawDocs,     setRawDocs]     = useState<ApiDocFull[]>([]);
  const [docs,        setDocs]        = useState<DocumentRegistry[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [lastSync,    setLastSync]    = useState<Date | null>(null);
  const [nextSync,    setNextSync]    = useState<Date | null>(null);
  const [now,         setNow]         = useState(() => new Date());
  const [selectedDoc, setSelectedDoc] = useState<ApiDocFull | null>(null);

  // Tick clock every minute
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const fetchDocs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(API.documents.list());
      if (res.ok) {
        const data: ApiDocFull[] = await res.json();
        setRawDocs(data);
        setDocs(data.map(apiDocToRegistry));
        if (data.length > 0) {
          const latestTs = data.reduce((mx, d) => d.synced_at > mx ? d.synced_at : mx, data[0].synced_at);
          const syncedAt = new Date(latestTs);
          setLastSync(syncedAt);
          setNextSync(new Date(syncedAt.getTime() + 10 * 60 * 1000));
        } else {
          setLastSync(new Date());
          setNextSync(new Date(Date.now() + 10 * 60 * 1000));
        }
      }
    } catch {
      // server unreachable — keep old data
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerSync = useCallback(async () => {
    try {
      setSyncing(true);
      await fetch(API.documents.sync(), { method: 'POST' });
      await fetchDocs();
    } finally {
      setSyncing(false);
    }
  }, [fetchDocs]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const [sorting,      setSorting]      = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data: docs,
    columns,
    getCoreRowModel:      getCoreRowModel(),
    getSortedRowModel:    getSortedRowModel(),
    getFilteredRowModel:  getFilteredRowModel(),
    onSortingChange:      setSorting,
    onGlobalFilterChange: setGlobalFilter,
    state: { sorting, globalFilter },
  });

  const stats = useMemo(() => ({
    total:   docs.length,
    pending: docs.filter((d) => d.status === 'SENT').length,
    overdue: docs.filter((d) => d.status === 'OVERDUE').length,
    signed:  docs.filter((d) => d.status === 'SIGNED').length,
    amount:  docs.reduce((s, d) => s + d.amount, 0),
  }), [docs]);

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{REAL_CLIENT.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            ИНН {REAL_CLIENT.inn} · ОГРНИП {REAL_CLIENT.ogrnip} · {REAL_CLIENT.region}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Sync status */}
          <div className="text-right hidden sm:block">
            {lastSync && (
              <p className="text-[10px] text-muted-foreground leading-none">
                Синхронизировано {lastSync.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            {nextSync && (
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                {(() => {
                  const diffMs = nextSync.getTime() - now.getTime();
                  if (diffMs <= 0) return 'Синхронизация скоро…';
                  const mins = Math.ceil(diffMs / 60_000);
                  return `Следующая через ${mins} мин`;
                })()}
              </p>
            )}
            {!lastSync && !loading && (
              <p className="text-[10px] text-amber-600 leading-none">Нет данных из 1С</p>
            )}
          </div>
          <button
            title="Синхронизировать сейчас"
            onClick={triggerSync}
            disabled={syncing || loading}
            className={cn(
              'h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500',
              'hover:bg-slate-50 hover:text-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            <RefreshCw className={cn('h-4 w-4', (syncing || loading) && 'animate-spin')} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Виджеты
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              {(Object.keys(WIDGET_LABEL) as WidgetKey[]).map((k) => (
                <DropdownMenuCheckboxItem key={k}
                  checked={widgetVisibility[k]}
                  onCheckedChange={() => toggleWidgetVisibility(k)}>
                  {WIDGET_LABEL[k]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Stats ── */}
      {widgetVisibility.stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Всего',      value: stats.total,   icon: FileText,      cls: 'text-slate-600'   },
            { label: 'Ожидают',    value: stats.pending, icon: Clock,         cls: 'text-blue-600'    },
            { label: 'Просрочено', value: stats.overdue, icon: AlertTriangle, cls: 'text-orange-600'  },
            { label: 'Подписано',  value: stats.signed,  icon: CheckCircle2,  cls: 'text-emerald-600' },
          ].map(({ label, value, icon: Icon, cls }) => (
            <Card key={label} className="border-0 shadow-sm bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn('p-2 rounded-lg bg-slate-50', cls)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold tabular-nums">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Document DataTable ── */}
      {widgetVisibility.documents && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Реестр документов</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">
                {formatCurrency(stats.amount)}
              </span>
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </CardHeader>
          <div className="px-4 pb-2">
            <Input
              placeholder="Поиск по номеру, контрагенту..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-8 text-xs max-w-sm"
            />
          </div>
          <CardContent className="p-0 pb-4">
            {loading ? (
              <p className="text-center py-10 text-xs text-muted-foreground">
                Загрузка документов из 1С…
              </p>
            ) : (
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id} className="hover:bg-transparent border-b border-slate-100">
                      {hg.headers.map((h) => (
                        <TableHead key={h.id} className="text-xs font-medium text-muted-foreground h-8 px-4">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer hover:bg-blue-50 border-b border-slate-50 transition-colors"
                        onClick={() => {
                          const raw = rawDocs.find(d => d.id === row.original.id);
                          setSelectedDoc(raw ?? null);
                        }}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="px-4 py-2.5">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="text-center py-8 text-xs text-muted-foreground">
                        Документов нет — создайте счёт или реализацию в 1С
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Integrations ── */}
      {widgetVisibility.integrations && (
        <div>
          <h2 className="text-sm font-semibold mb-3">Интеграции</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {integrations.map((intg) => (
              <Card key={intg.key}
                className={cn(
                  'border shadow-none transition-all',
                  intg.enabled ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60',
                )}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg leading-none">{intg.icon}</span>
                    <Switch
                      checked={intg.enabled}
                      onCheckedChange={() => toggleIntegration(intg.key as IntegrationKey)}
                      className="scale-75 origin-right"
                    />
                  </div>
                  <p className="text-xs font-medium">{intg.label}</p>
                  <p className={cn(
                    'text-[10px] mt-0.5 font-medium',
                    intg.connected ? 'text-emerald-600' : 'text-slate-400',
                  )}>
                    {intg.connected ? '● Подключено' : '○ Не настроено'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Invoice detail panel ── */}
      <InvoicePanel doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
    </div>
  );
}
