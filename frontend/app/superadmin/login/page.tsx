'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogoIcon } from '@/components/icons/LogoIcon';
import { ThemeToggle } from '@/components/ThemeToggle';
import { API } from '@/lib/api';
import { useSuperAdminAuthStore } from '@/store/useSuperAdminAuthStore';

export default function SuperAdminLoginPage() {
  const router  = useRouter();
  const setAuth = useSuperAdminAuthStore((s) => s.setAuth);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch(API.superadmin.login(), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail ?? 'Ошибка входа'); return; }

      setAuth(data.access_token, { id: data.superadmin_id, name: data.name, email: data.email });
      router.push('/superadmin/firms');
    } catch {
      setError('Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[100dvh] items-center justify-center bg-slate-50 dark:bg-slate-950 relative">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <LogoIcon className="h-10 w-auto" />
          <div>
            <p className="text-lg font-bold leading-none text-slate-900 dark:text-white">BuhgSaaS</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Суперадмин · Техподдержка</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Вход</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Доступ только для сотрудников техподдержки</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="support@glavinstrument.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {loading ? 'Вход…' : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
