'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogoIcon } from '@/components/icons/LogoIcon';
import { API } from '@/lib/api';
import { useAuthStore, AuthUser } from '@/store/useAuthStore';

export default function LoginPage() {
  const router  = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch(API.auth.login(), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail ?? 'Ошибка входа'); return; }

      const user: AuthUser = {
        id:       data.user_id,
        firmId:   data.firm_id,
        tenantId: data.tenant_id,
        name:     data.name,
        email:    data.email,
        role:     data.role,
        firmName: data.name,
        firmInn:  null,
        firmPlan: 'free',
      };
      setAuth(data.access_token, user);

      // Fetch full profile to get firm details
      const meRes = await fetch(API.auth.me(), {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        setAuth(data.access_token, {
          id:       me.id,
          firmId:   me.firm_id,
          tenantId: me.tenant_id,
          name:     me.name,
          email:    me.email,
          role:     me.role,
          firmName: me.firm_name,
          firmInn:  me.firm_inn,
          firmPlan: me.firm_plan,
        });
        // If tenant not yet configured → onboarding
        const base = `/cli/${me.firm_id}`;
        router.push(me.tenant_id && data.connected !== false ? `${base}/dashboard` : `${base}/onboarding`);
      } else {
        router.push(`/cli/${data.firm_id}/dashboard`);
      }
    } catch {
      setError('Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-3 mb-8 justify-center">
        <LogoIcon className="h-10 w-auto" />
        <div>
          <p className="text-lg font-bold leading-none">BuhgSaaS</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Рабочее место бухгалтера</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Вход</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Войдите в личный кабинет бухгалтерии</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="you@firm.ru"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            className="w-full py-2.5 px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-4">
        Нет аккаунта?{' '}
        <Link href="/register" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
          Зарегистрировать бухгалтерию
        </Link>
      </p>
    </div>
  );
}
