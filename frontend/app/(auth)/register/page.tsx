'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogoIcon } from '@/components/icons/LogoIcon';
import { API } from '@/lib/api';
import { useAuthStore, AuthUser } from '@/store/useAuthStore';

export default function RegisterPage() {
  const router  = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [firmName,  setFirmName]  = useState('');
  const [name,      setName]      = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch(API.auth.register(), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          firm_name: firmName,
          firm_inn:  null,
          name,
          email,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail ?? 'Ошибка регистрации'); return; }

      const user: AuthUser = {
        id:       data.user_id,
        firmId:   data.firm_id,
        tenantId: data.tenant_id,
        name:     data.name,
        email:    data.email,
        role:     data.role,
        firmName: firmName,
        firmInn:  null,
        firmPlan: 'free',
      };
      setAuth(data.access_token, user);
      router.push(`/cli/${data.firm_id}/onboarding`);
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
          <p className="text-xs text-slate-500 mt-0.5">Рабочее место бухгалтера</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <h1 className="text-xl font-bold text-slate-900 mb-1">Регистрация</h1>
        <p className="text-sm text-slate-500 mb-6">Создайте личный кабинет бухгалтерии</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Название бухгалтерии <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ООО «Учёт и порядок»"
            />
          </div>
          <hr className="border-slate-100" />

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Ваше имя <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Иванова Анна Сергеевна"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@firm.ru"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Пароль <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Минимум 6 символов"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-slate-500 mt-4">
        Уже есть аккаунт?{' '}
        <Link href="/login" className="text-blue-600 hover:underline font-medium">
          Войти
        </Link>
      </p>
    </div>
  );
}
