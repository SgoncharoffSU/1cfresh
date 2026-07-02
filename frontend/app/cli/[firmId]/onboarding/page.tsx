'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { CheckCircle2, Database, Send, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { LogoIcon } from '@/components/icons/LogoIcon';
import { TelegramIcon } from '@/components/icons/TelegramIcon';
import { API, apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

type Step = '1c' | 'tg' | 'done';

export default function OnboardingPage() {
  const router  = useRouter();
  const { firmId: firmIdParam } = useParams<{ firmId: string }>();
  const { token, user, setUser, _hasHydrated } = useAuthStore();

  // Same UX-only guard pattern as cli/[firmId]/(admin)/layout.tsx.
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token || !user) { router.replace('/login'); return; }
    if (String(user.firmId) !== firmIdParam) { router.replace(`/cli/${user.firmId}/onboarding`); }
  }, [token, user, router, _hasHydrated, firmIdParam]);

  const [step, setStep] = useState<Step>('1c');

  // 1C fields
  const [odataUrl,      setOdataUrl]      = useState('');
  const [odataLogin,    setOdataLogin]    = useState('');
  const [odataPassword, setOdataPassword] = useState('');
  const [onecLoading,   setOnecLoading]   = useState(false);
  const [onecError,     setOnecError]     = useState('');
  const [onecOk,        setOnecOk]        = useState(false);

  // TG step
  const [tgSkipped, setTgSkipped] = useState(false);

  async function handleOnecSave(e: React.FormEvent) {
    e.preventDefault();
    setOnecError('');
    setOnecLoading(true);
    try {
      const res  = await apiFetch(API.auth.tenant(), {
        method: 'PUT',
        body:   JSON.stringify({
          odata_url:      odataUrl.trim(),
          odata_login:    odataLogin.trim(),
          odata_password: odataPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setOnecError(data.detail ?? 'Ошибка сохранения'); return; }

      // Update tenantId in auth store
      if (user) setUser({ ...user, tenantId: data.tenant_id });
      setOnecOk(data.connected);
      if (!data.connected) {
        setOnecError('Настройки сохранены, но подключиться к 1С не удалось. Проверьте учётные данные позже.');
      }
      setStep('tg');
    } catch {
      setOnecError('Ошибка соединения с сервером');
    } finally {
      setOnecLoading(false);
    }
  }

  const STEPS: { id: Step; label: string }[] = [
    { id: '1c',   label: 'Подключение 1С'  },
    { id: 'tg',   label: 'Telegram-бот'    },
    { id: 'done', label: 'Готово'           },
  ];

  const stepIdx = STEPS.findIndex((s) => s.id === step);

  if (!_hasHydrated) return (
    <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin" />
  );
  if (!token || !user || String(user.firmId) !== firmIdParam) return null;

  return (
    <div className="w-full max-w-lg">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8 justify-center">
        <LogoIcon className="h-10 w-auto" />
        <div>
          <p className="text-lg font-bold leading-none">BuhgSaaS</p>
          <p className="text-xs text-slate-500 mt-0.5">Настройка рабочего места</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 flex-1 last:flex-none">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              i < stepIdx  ? 'bg-emerald-100 text-emerald-700' :
              i === stepIdx ? 'bg-slate-900 text-white' :
                             'bg-slate-100 text-slate-400'
            }`}>
              {i < stepIdx ? <CheckCircle2 className="h-3 w-3" /> : <span>{i + 1}</span>}
              {s.label}
            </div>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-slate-200" />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">

        {/* ── Step 1: 1C ─────────────────────────────────────────────────────── */}
        {step === '1c' && (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Database className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">Подключение к 1С:Фреш</h2>
                <p className="text-xs text-slate-500">OData-интерфейс для синхронизации документов</p>
              </div>
            </div>

            <form onSubmit={handleOnecSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  URL OData-сервиса <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={odataUrl}
                  onChange={(e) => setOdataUrl(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://msk1.1cfresh.com/a/ea/XXXXXXX/odata/standard.odata"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Настройки → Интеграция → OData → Адрес сервиса
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Пользователь</label>
                  <input
                    type="text"
                    value={odataLogin}
                    onChange={(e) => setOdataLogin(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="odata.user"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Пароль</label>
                  <input
                    type="password"
                    value={odataPassword}
                    onChange={(e) => setOdataPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {onecError && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  {onecError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={onecLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  {onecLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  {onecLoading ? 'Проверяем…' : 'Подключить и проверить'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep('tg')}
                  className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Пропустить
                </button>
              </div>
            </form>
          </>
        )}

        {/* ── Step 2: Telegram ──────────────────────────────────────────────── */}
        {step === 'tg' && (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <TelegramIcon className="h-5 w-5 text-sky-500" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">Telegram-бот</h2>
                <p className="text-xs text-slate-500">Для отправки счетов клиентам прямо в мессенджер</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3 text-sm text-slate-700">
                <p className="font-medium text-slate-800">Как подключить бота:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-600 leading-relaxed">
                  <li>Откройте <span className="font-mono bg-white border border-slate-200 rounded px-1">@BotFather</span> в Telegram</li>
                  <li>Создайте нового бота: <span className="font-mono bg-white border border-slate-200 rounded px-1">/newbot</span></li>
                  <li>Скопируйте токен и добавьте в <span className="font-mono bg-white border border-slate-200 rounded px-1">.env</span> на сервере:<br />
                    <code className="block mt-1 bg-slate-900 text-emerald-400 rounded px-2 py-1 text-[11px]">
                      TELEGRAM_BOT_TOKEN=&lt;ваш_токен&gt;
                    </code>
                  </li>
                  <li>Перезапустите сервис: <code className="bg-white border border-slate-200 rounded px-1 text-[11px]">pm2 restart integration-1c-api</code></li>
                  <li>Клиент пишет боту первое сообщение — чат появится в разделе «Чаты»</li>
                </ol>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('done')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800"
                >
                  <Send className="h-4 w-4" />
                  Понятно, продолжить
                </button>
                <button
                  onClick={() => { setTgSkipped(true); setStep('done'); }}
                  className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-50"
                >
                  Пропустить
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Step 3: Done ─────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="text-center py-4">
            <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Готово!</h2>
            <p className="text-sm text-slate-500 mb-6">
              Рабочее место бухгалтерии{onecOk ? ' подключено к 1С и' : ''} готово к работе.
            </p>
            {!onecOk && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-5">
                Подключение к 1С пока не настроено. Вы сможете сделать это позже в настройках.
              </p>
            )}
            <button
              onClick={() => router.push(`/cli/${firmIdParam}/dashboard`)}
              className="flex items-center justify-center gap-2 w-full py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-colors"
            >
              Перейти в рабочее место
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
