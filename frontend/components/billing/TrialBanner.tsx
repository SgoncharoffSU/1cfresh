'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Clock, X, Zap, AlertTriangle } from 'lucide-react';
import { API, apiFetch } from '@/lib/api';

interface BillingStatus {
  status: string;
  days_left: number;
  plan: string | null;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  access_allowed: boolean;
}

export function TrialBanner() {
  const { firmId } = useParams<{ firmId: string }>();
  const billingHref = `/cli/${firmId}/billing`;
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    apiFetch(API.billing.status())
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setStatus(d))
      .catch(() => {});
  }, []);

  if (!status || closed) return null;
  if (status.status === 'active') return null;

  const isExpired = status.status === 'expired' || status.days_left === 0;
  const isWarning = !isExpired && status.days_left <= 5;
  const endDate   = status.trial_ends_at ? fmtDate(status.trial_ends_at) : null;

  if (isExpired) {
    return (
      <div className="bg-red-600 px-4 py-2.5 flex items-center gap-3 text-white text-sm flex-shrink-0">
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span className="flex-1 font-medium">Пробный период завершён. Оформите подписку для продолжения работы.</span>
        <Link href={billingHref}
          className="flex-shrink-0 bg-white text-red-600 font-semibold text-xs px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
          Выбрать тариф
        </Link>
      </div>
    );
  }

  if (isWarning) {
    return (
      <div className="bg-amber-500 px-4 py-2 flex items-center gap-3 text-white text-sm flex-shrink-0">
        <Clock size={14} className="flex-shrink-0" />
        <span className="flex-1">
          <span className="font-semibold">Пробный период:</span> осталось {status.days_left} {dayWord(status.days_left)}
          {endDate && <span className="opacity-80"> · до {endDate}</span>}
        </span>
        <Link href={billingHref}
          className="flex-shrink-0 flex items-center gap-1.5 bg-white text-amber-600 font-semibold text-xs px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors">
          <Zap size={11} />
          Оформить подписку
        </Link>
        <button onClick={() => setClosed(true)} className="flex-shrink-0 text-white/60 hover:text-white ml-1">
          <X size={14} />
        </button>
      </div>
    );
  }

  // Trial with plenty of time left — compact blue info bar, always visible
  return (
    <div className="bg-blue-600 px-4 py-1.5 flex items-center gap-2 text-white text-xs flex-shrink-0">
      <Clock size={12} className="flex-shrink-0 opacity-70" />
      <span className="flex-1">
        Пробный период{endDate && <> · <span className="font-medium">до {endDate}</span></>}
      </span>
      <Link href={billingHref}
        className="flex-shrink-0 underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity">
        Оформить подписку
      </Link>
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
