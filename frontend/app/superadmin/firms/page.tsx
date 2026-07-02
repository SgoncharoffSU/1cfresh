'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, ChevronRight, Search } from 'lucide-react';
import { API, superAdminApiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

interface FirmSummary {
  id: number;
  name: string;
  inn: string | null;
  is_active: boolean;
  subscription_status: string;
  subscription_plan: string | null;
  user_count: number;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  trial: 'Триал', active: 'Активна', expired: 'Истёк', suspended: 'Заблокирована',
};

export default function SuperAdminFirmsPage() {
  const [firms,   setFirms]   = useState<FirmSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query,   setQuery]   = useState('');

  useEffect(() => {
    superAdminApiFetch(API.superadmin.firms())
      .then((r) => r.ok ? r.json() : [])
      .then(setFirms)
      .finally(() => setLoading(false));
  }, []);

  const filtered = firms.filter((f) =>
    !query.trim() ||
    f.name.toLowerCase().includes(query.toLowerCase()) ||
    (f.inn ?? '').includes(query) ||
    String(f.id) === query.trim(),
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Аккаунты бухгалтерий</h1>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-0.5">Всего: {firms.length}</p>
        </div>
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название, ИНН или ID…"
            className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-blue-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-16">Ничего не найдено</p>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {filtered.map((firm) => (
            <Link key={firm.id} href={`/superadmin/firms/${firm.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
              <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{firm.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  #{firm.id}{firm.inn ? ` · ИНН ${firm.inn}` : ''} · {firm.user_count} польз.
                </p>
              </div>
              <span className={cn(
                'text-[10px] font-medium px-2 py-1 rounded-full flex-shrink-0',
                firm.subscription_status === 'active' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                  : firm.subscription_status === 'trial' ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                  : 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400',
              )}>
                {STATUS_LABEL[firm.subscription_status] ?? firm.subscription_status}
              </span>
              {!firm.is_active && (
                <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex-shrink-0">
                  Отключена
                </span>
              )}
              <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-600 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
