'use client';

import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { API, superAdminApiFetch } from '@/lib/api';

interface AuditEntry {
  id: number;
  superadmin_name: string;
  firm_id: number;
  firm_name: string;
  target_user_name: string;
  started_at: string;
}

export default function SuperAdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    superAdminApiFetch(API.superadmin.audit())
      .then((r) => r.ok ? r.json() : [])
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Журнал входов в аккаунты</h1>
        <p className="text-sm text-slate-500 mt-0.5">Кто, в какую фирму и когда заходил через impersonation</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-blue-500 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600 py-16">
          <ScrollText className="h-10 w-10 text-slate-200 dark:text-slate-800" />
          <p className="text-sm">Записей пока нет</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {entries.map((e) => (
            <div key={e.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 dark:text-white">
                  <span className="font-medium">{e.superadmin_name}</span>
                  {' → '}
                  <span className="text-slate-600 dark:text-slate-300">{e.firm_name}</span>
                  <span className="text-slate-500"> (#{e.firm_id})</span>
                  {' как '}
                  <span className="text-slate-600 dark:text-slate-300">{e.target_user_name}</span>
                </p>
              </div>
              <span className="text-xs text-slate-500 flex-shrink-0">
                {new Date(e.started_at).toLocaleString('ru-RU')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
