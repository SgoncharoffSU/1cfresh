'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, Clock, Zap, Users, FileText,
  ArrowRight, Shield, BarChart3, AlertTriangle,
  CreditCard, RefreshCw
} from 'lucide-react';
import { API, apiFetch } from '@/lib/api';
import { useSearchParams } from 'next/navigation';

interface BillingStatus {
  status:               string;
  plan:                 string | null;
  days_left:            number;
  trial_ends_at:        string | null;
  subscription_ends_at: string | null;
  usage_docs_month:     number;
  usage_clients:        number;
  access_allowed:       boolean;
  plans: Record<string, {
    name:              string;
    price_month:       number;
    price_year:        number;
    max_clients:       number | null;
    max_docs_month:    number | null;
    extra_doc_price:   number;
    included_integrations:   number | null;
    extra_integration_price: number;
  }>;
  integrations_used:        number;
  integrations_included:    number | null;
  extra_integration_price:  number;
  estimated_amount:         number;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    trial:     { label: 'Пробный период',  cls: 'bg-blue-100 text-blue-700' },
    active:    { label: 'Активна',         cls: 'bg-green-100 text-green-700' },
    expired:   { label: 'Истёк',           cls: 'bg-red-100 text-red-700' },
    suspended: { label: 'Приостановлена',  cls: 'bg-amber-100 text-amber-700' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}

function UsageBar({ used, max, label }: { used: number; max: number | null; label: string }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-blue-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{label}</span>
        <span className="font-medium text-slate-700">{used} {max ? `/ ${max}` : '∞'}</span>
      </div>
      {max && (
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  const [billing, setBilling]   = useState<BillingStatus | null>(null);
  const [loading, setLoading]   = useState(true);
  const [paying,  setPaying]    = useState<string | null>(null);
  const [period,  setPeriod]    = useState<'month' | 'year'>('month');
  const params = useSearchParams();

  useEffect(() => {
    apiFetch(API.billing.status())
      .then(r => r.json())
      .then(setBilling)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe(plan: string) {
    setPaying(plan);
    try {
      const r = await apiFetch(API.billing.createPayment(), {
        method: 'POST',
        body: JSON.stringify({ plan, period }),
      });
      const data = await r.json();
      if (data.confirmation_url) {
        window.location.href = data.confirmation_url;
      }
    } catch {
      alert('Ошибка создания платежа. Попробуйте позже.');
    } finally {
      setPaying(null);
    }
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin" />
    </div>
  );

  const isSuccess  = params?.get('payment') === 'success';
  const isPending  = params?.get('pending')  === '1';

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-5 py-8">

        {/* Payment success */}
        {isSuccess && (
          <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
            <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-800">Оплата прошла успешно!</p>
              <p className="text-sm text-green-600">Подписка активирована. Приятной работы!</p>
            </div>
          </div>
        )}

        {/* Payment pending */}
        {isPending && (
          <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <Clock size={20} className="text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-amber-800">Платёж обрабатывается</p>
              <p className="text-sm text-amber-600">После подтверждения подписка активируется автоматически.</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900 mb-1">Подписка и тариф</h1>
          <p className="text-slate-500 text-sm">Управляйте вашим планом и следите за использованием ресурсов.</p>
        </div>

        {billing && (
          <>
            {/* Current status card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-8">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-base font-semibold text-slate-900">Текущий статус</h2>
                    <StatusBadge status={billing.status} />
                  </div>
                  {billing.status === 'trial' && (
                    <p className="text-sm text-slate-500">
                      Пробный период истекает через{' '}
                      <span className="font-semibold text-slate-700">{billing.days_left} {dayWord(billing.days_left)}</span>
                      {billing.trial_ends_at && ` (${fmtDate(billing.trial_ends_at)})`}
                    </p>
                  )}
                  {billing.status === 'active' && billing.plan && (
                    <p className="text-sm text-slate-500">
                      Тариф <span className="font-semibold text-slate-700">{billing.plans[billing.plan]?.name ?? billing.plan}</span>
                      {billing.subscription_ends_at && `, следующее списание ${fmtDate(billing.subscription_ends_at)}`}
                    </p>
                  )}
                  {billing.status === 'expired' && (
                    <p className="text-sm text-red-600 font-medium">
                      Доступ ограничен. Выберите тариф для продолжения работы.
                    </p>
                  )}
                </div>
                {billing.status === 'trial' && (
                  <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-blue-50 flex flex-col items-center justify-center">
                    <span className="text-xl font-extrabold text-blue-600">{billing.days_left}</span>
                    <span className="text-[9px] text-blue-400 font-medium">дней</span>
                  </div>
                )}
              </div>

              {/* Usage */}
              <div className="grid sm:grid-cols-2 gap-5">
                <UsageBar
                  used={billing.usage_docs_month}
                  max={billing.plan ? billing.plans[billing.plan]?.max_docs_month ?? null : null}
                  label="Документов в этом месяце"
                />
                <UsageBar
                  used={billing.usage_clients}
                  max={billing.plan ? billing.plans[billing.plan]?.max_clients ?? null : null}
                  label="Активных клиентов"
                />
                <UsageBar
                  used={billing.integrations_used}
                  max={billing.integrations_included}
                  label="Интеграций с 1С"
                />
              </div>

              {billing.integrations_included != null && billing.integrations_used > billing.integrations_included && (
                <p className="mt-4 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Подключено {billing.integrations_used} интеграций с 1С — {billing.integrations_used - billing.integrations_included} сверх лимита тарифа
                  {' '}(+{(billing.integrations_used - billing.integrations_included) * billing.extra_integration_price} ₽/мес).
                  {' '}К оплате: <span className="font-semibold">{billing.estimated_amount.toLocaleString('ru-RU')} ₽</span>
                </p>
              )}
            </div>

            {/* Plan selector */}
            {billing.status !== 'active' && (
              <>
                <h2 className="text-lg font-extrabold text-slate-900 mb-4">Выберите тариф</h2>

                {/* Period toggle */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-6">
                  {(['month', 'year'] as const).map(p => (
                    <button key={p} onClick={() => setPeriod(p)}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${period === p ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                      {p === 'month' ? 'Месяц' : 'Год −17%'}
                    </button>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                  {Object.entries(billing.plans).map(([key, plan]) => {
                    const price = period === 'year' ? plan.price_year : plan.price_month;
                    const isCurrentPlan = billing.plan === key;
                    const planIntegrationOverage = plan.included_integrations != null
                      ? Math.max(0, billing.integrations_used - plan.included_integrations)
                      : 0;
                    const overageCharge = planIntegrationOverage * plan.extra_integration_price;
                    return (
                      <div key={key} className={`relative flex flex-col rounded-2xl border p-6 ${key === 'pro' ? 'bg-[#0f2444] border-[#1c3a5e]' : 'bg-white border-slate-100'}`}>
                        {key === 'pro' && (
                          <div className="absolute -top-3 left-6 bg-blue-500 text-white text-xs font-semibold px-3 py-0.5 rounded-full">Популярный</div>
                        )}
                        <div className={`text-sm font-semibold mb-1 ${key === 'pro' ? 'text-blue-300' : 'text-slate-500'}`}>{plan.name}</div>
                        <div className={`mb-4 ${key === 'pro' ? 'text-white' : 'text-slate-900'}`}>
                          <span className="text-3xl font-extrabold">{(price + overageCharge).toLocaleString('ru-RU')} ₽</span>
                          <span className={`text-sm ml-1 ${key === 'pro' ? 'text-white/40' : 'text-slate-400'}`}>/ {period === 'year' ? 'год' : 'месяц'}</span>
                          {overageCharge > 0 && (
                            <div className={`text-xs mt-0.5 ${key === 'pro' ? 'text-white/40' : 'text-slate-400'}`}>
                              из них {overageCharge.toLocaleString('ru-RU')} ₽ за {planIntegrationOverage} доп. интеграций 1С
                            </div>
                          )}
                        </div>

                        <ul className="flex flex-col gap-2.5 flex-1 mb-6">
                          {[
                            plan.max_clients ? `До ${plan.max_clients} клиентов` : 'Неограниченно клиентов',
                            plan.max_docs_month ? `До ${plan.max_docs_month} документов/мес` : 'Безлимитные документы',
                            plan.included_integrations != null ? `До ${plan.included_integrations} интеграций с 1С` : 'Неограниченно интеграций с 1С',
                            'Полный документооборот (счёт + реализация + СФ)',
                            'Telegram & Email доставка',
                            key === 'bureau' ? 'Приоритетная поддержка' : null,
                            key === 'bureau' ? 'Персональный онбординг' : null,
                          ].filter(Boolean).map((f) => (
                            <li key={f!} className="flex items-center gap-2 text-sm">
                              <CheckCircle2 size={13} className={key === 'pro' ? 'text-blue-400' : 'text-green-500'} />
                              <span className={key === 'pro' ? 'text-white/70' : 'text-slate-600'}>{f}</span>
                            </li>
                          ))}
                          {plan.extra_doc_price > 0 && (
                            <li className="flex items-center gap-2 text-xs mt-1">
                              <ArrowRight size={11} className={key === 'pro' ? 'text-white/30' : 'text-slate-300'} />
                              <span className={key === 'pro' ? 'text-white/40' : 'text-slate-400'}>+{plan.extra_doc_price} ₽ за документ сверх лимита</span>
                            </li>
                          )}
                          {plan.extra_integration_price > 0 && (
                            <li className="flex items-center gap-2 text-xs mt-1">
                              <ArrowRight size={11} className={key === 'pro' ? 'text-white/30' : 'text-slate-300'} />
                              <span className={key === 'pro' ? 'text-white/40' : 'text-slate-400'}>+{plan.extra_integration_price} ₽/мес за интеграцию сверх лимита</span>
                            </li>
                          )}
                        </ul>

                        <button
                          onClick={() => handleSubscribe(key)}
                          disabled={paying === key || isCurrentPlan}
                          className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
                            key === 'pro'
                              ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg'
                              : 'bg-slate-900 hover:bg-slate-800 text-white'
                          }`}>
                          {paying === key ? (
                            <><RefreshCw size={14} className="animate-spin" /> Переход к оплате…</>
                          ) : isCurrentPlan ? (
                            <><CheckCircle2 size={14} /> Текущий тариф</>
                          ) : (
                            <><Zap size={14} /> Оформить подписку</>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <p className="text-center text-xs text-slate-400 mt-5">
                  Оплата через ЮКасса · Безопасная транзакция · Отмена в любое время
                </p>
              </>
            )}

            {/* Active plan management */}
            {billing.status === 'active' && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <h2 className="text-base font-semibold text-slate-900 mb-4">Управление подпиской</h2>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => handleSubscribe(billing.plan === 'pro' ? 'bureau' : 'pro')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                    <ArrowRight size={14} />
                    {billing.plan === 'pro' ? 'Перейти на Бюро' : 'Перейти на Профи'}
                  </button>
                  <a href="mailto:support@buhgsaas.ru?subject=Отмена подписки"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-red-100 text-red-600 rounded-xl text-sm hover:bg-red-50 transition-colors">
                    Отменить подписку
                  </a>
                </div>
              </div>
            )}
          </>
        )}

        {/* FAQ */}
        <div className="mt-10 pt-8 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Частые вопросы</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { q: 'Когда начнётся списание?', a: 'После завершения 15-дневного пробного периода. Карта привязывается только при оформлении подписки.' },
              { q: 'Как отменить подписку?', a: 'В любой момент через кнопку «Отменить подписку». Доступ сохраняется до конца оплаченного периода.' },
              { q: 'Можно ли сменить тариф?', a: 'Да, в любое время. При переходе на более дорогой тариф доплата рассчитывается пропорционально.' },
              { q: 'Что такое оплата за ресурс?', a: 'На тарифе Профи сверх 500 документов в месяц взимается 5 ₽ за каждый дополнительный документ.' },
              { q: 'Как считаются интеграции с 1С?', a: 'У каждого вашего клиента — своя база 1С. На тарифе Профи включено 5 подключений, каждое следующее — 500 ₽/мес. На Бюро интеграции не ограничены.' },
            ].map(({ q, a }) => (
              <div key={q} className="p-4 bg-slate-50 rounded-xl">
                <p className="text-sm font-medium text-slate-800 mb-1">{q}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function dayWord(n: number) {
  if (n === 1) return 'день';
  if (n >= 2 && n <= 4) return 'дня';
  return 'дней';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
