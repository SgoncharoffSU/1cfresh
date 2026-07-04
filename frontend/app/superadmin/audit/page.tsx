'use client';

import { useCallback, useEffect, useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import { API, superAdminApiFetch } from '@/lib/api';
import { accountNumber } from '@/lib/utils';

interface ActivityEntry {
  id:          number;
  created_at:  string;
  actor_type:  string;
  actor_id:    number | null;
  actor_name:  string | null;
  firm_id:     number | null;
  firm_name:   string | null;
  action:      string;
  description: string;
  entity_type: string | null;
  entity_id:   string | null;
}

const ACTOR_LABEL: Record<string, string> = {
  user:       'Бухгалтер',
  superadmin: 'Суперадмин',
  abonent:    'Клиент',
  system:     'Система',
};

const PAGE_SIZE = 50;

export default function SuperAdminAuditPage() {
  const [entries,   setEntries]   = useState<ActivityEntry[]>([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [offset,    setOffset]    = useState(0);
  const [actorType, setActorType] = useState('');
  const [firmId,    setFirmId]    = useState('');
  const [action,    setAction]    = useState('');

  const load = useCallback((nextOffset: number, append: boolean) => {
    setLoading(true);
    superAdminApiFetch(API.superadmin.activity({
      limit: PAGE_SIZE,
      offset: nextOffset,
      actorType: actorType || undefined,
      firmId: firmId ? Number(firmId) : undefined,
      action: action || undefined,
    }))
      .then((r) => r.ok ? r.json() : { items: [], total: 0 })
      .then((data: { items: ActivityEntry[]; total: number }) => {
        setEntries((prev) => append ? [...prev, ...data.items] : data.items);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }, [actorType, firmId, action]);

  useEffect(() => { setOffset(0); load(0, false); }, [load]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Журнал действий</h1>
          <p className="text-sm text-slate-500 mt-0.5">Все действия — бухгалтеров, сотрудников, клиентов и суперадминов</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={actorType}
            onChange={(e) => setActorType(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Все роли</option>
            <option value="user">Бухгалтеры</option>
            <option value="superadmin">Суперадмины</option>
            <option value="abonent">Клиенты</option>
            <option value="system">Система</option>
          </select>
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={firmId}
              onChange={(e) => setFirmId(e.target.value.replace(/\D/g, ''))}
              placeholder="ID фирмы…"
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
            />
          </div>
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Тип действия (client.create…)"
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
          />
        </div>
      </div>

      {loading && entries.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-blue-500 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600 py-16">
          <ScrollText className="h-10 w-10 text-slate-200 dark:text-slate-800" />
          <p className="text-sm">Записей пока нет</p>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {entries.map((e) => (
              <div key={e.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex-shrink-0">
                  {ACTOR_LABEL[e.actor_type] ?? e.actor_type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 dark:text-white truncate">
                    <span className="font-medium">{e.actor_name ?? '—'}</span>
                    {' — '}
                    <span className="text-slate-600 dark:text-slate-300">{e.description}</span>
                    {e.firm_name && (
                      <span className="text-slate-400"> · {e.firm_name} (#{accountNumber(e.firm_id!)})</span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{e.action}</p>
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0">
                  {new Date(e.created_at).toLocaleString('ru-RU')}
                </span>
              </div>
            ))}
          </div>

          {entries.length < total && (
            <div className="flex justify-center">
              <button
                onClick={() => { const next = offset + PAGE_SIZE; setOffset(next); load(next, true); }}
                disabled={loading}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Загрузка…' : `Показать ещё (${total - entries.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
