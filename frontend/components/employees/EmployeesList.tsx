'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, UserCog, Power } from 'lucide-react';
import { API, apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { cn } from '@/lib/utils';
import { AddEmployeeModal } from '@/components/employees/AddEmployeeModal';

interface Employee {
  id:         number;
  name:       string;
  email:      string;
  role:       'CHIEF_ACCOUNTANT' | 'ACCOUNTANT';
  is_active:  boolean;
  created_at: string;
}

const ROLE_LABEL: Record<Employee['role'], string> = {
  CHIEF_ACCOUNTANT: 'Главный бухгалтер',
  ACCOUNTANT:       'Бухгалтер',
};

export function EmployeesList() {
  const { user } = useAuthStore();
  const isChief = user?.role === 'CHIEF_ACCOUNTANT';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showAdd,   setShowAdd]   = useState(false);
  const [busyId,    setBusyId]    = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(API.employees.list());
      if (res.ok) setEmployees(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(id: number) {
    setBusyId(id);
    try {
      const res = await apiFetch(API.employees.toggleActive(id), { method: 'PATCH' });
      if (res.ok) {
        const updated: Employee = await res.json();
        setEmployees((prev) => prev.map((e) => e.id === id ? updated : e));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (!isChief) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-sm text-muted-foreground">Управление сотрудниками доступно только главному бухгалтеру.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Сотрудники</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {employees.length} {employees.length === 1 ? 'человек' : 'человека'} · 1 бесплатно, далее 990 ₽/мес за каждого
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Добавить сотрудника
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-7 w-7 rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-blue-500 animate-spin" />
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2 text-muted-foreground">
            <UserCog className="h-8 w-8 text-slate-200 dark:text-slate-700" />
            <p className="text-sm">Пока нет сотрудников</p>
          </div>
        ) : (
          employees.map((e, i) => (
            <div
              key={e.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3',
                i < employees.length - 1 && 'border-b border-slate-50 dark:border-slate-800',
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{e.name}</p>
                  {!e.is_active && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex-shrink-0">
                      Отключён
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{e.email} · {ROLE_LABEL[e.role]}</p>
              </div>
              {e.role !== 'CHIEF_ACCOUNTANT' && (
                <button
                  onClick={() => handleToggle(e.id)}
                  disabled={busyId === e.id}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0',
                    e.is_active
                      ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40'
                      : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40',
                  )}
                >
                  <Power className="h-3.5 w-3.5" />
                  {e.is_active ? 'Деактивировать' : 'Активировать'}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {showAdd && (
        <AddEmployeeModal onClose={() => setShowAdd(false)} onAdded={load} />
      )}
    </div>
  );
}
