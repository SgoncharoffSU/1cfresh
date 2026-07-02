'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, LogIn, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { API, superAdminApiFetch } from '@/lib/api';

interface FirmUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface FirmDetail {
  firm: {
    id: number; name: string; inn: string | null; is_active: boolean;
    subscription_status: string; subscription_plan: string | null;
    user_count: number; created_at: string;
  };
  users: FirmUser[];
}

const ROLE_LABEL: Record<string, string> = {
  CHIEF_ACCOUNTANT: 'Главный бухгалтер', ACCOUNTANT: 'Бухгалтер',
};

export default function SuperAdminFirmDetailPage() {
  const router = useRouter();
  const { firmId } = useParams<{ firmId: string }>();
  const [detail,  setDetail]  = useState<FirmDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    superAdminApiFetch(API.superadmin.firmDetail(Number(firmId)))
      .then((r) => r.ok ? r.json() : null)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [firmId]);

  async function handleImpersonate(targetUserId: number) {
    setBusyUserId(targetUserId);
    setError('');
    try {
      const res = await superAdminApiFetch(API.superadmin.impersonate(Number(firmId)), {
        method: 'POST',
        body:   JSON.stringify({ target_user_id: targetUserId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail ?? 'Не удалось войти в аккаунт'); return; }

      // Open in a new tab so the superadmin's own session/tab is untouched, and store
      // the impersonation token in that new tab's localStorage before it navigates.
      const w = window.open('about:blank', '_blank');
      if (w) {
        w.localStorage.setItem('auth-store', JSON.stringify({
          state: {
            token: data.access_token,
            user: {
              id: data.user_id, firmId: data.firm_id, tenantId: null,
              name: '', email: '', role: '', firmName: detail?.firm.name ?? '',
              firmInn: detail?.firm.inn ?? null, firmPlan: detail?.firm.subscription_plan ?? 'trial',
            },
          },
          version: 1,
        }));
        w.location.href = data.redirect;
      }
    } catch {
      setError('Ошибка соединения с сервером');
    } finally {
      setBusyUserId(null);
    }
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="h-7 w-7 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
    </div>
  );
  if (!detail) return <p className="text-sm text-slate-500 text-center py-16">Фирма не найдена</p>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <Link href="/superadmin/firms" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
        <ArrowLeft className="h-3 w-3" />
        Все аккаунты
      </Link>

      <div>
        <h1 className="text-xl font-bold text-white">{detail.firm.name}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          #{detail.firm.id}{detail.firm.inn ? ` · ИНН ${detail.firm.inn}` : ''} · {detail.firm.subscription_status}
          {detail.firm.subscription_plan ? ` (${detail.firm.subscription_plan})` : ''}
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="bg-slate-900 rounded-xl border border-slate-800 divide-y divide-slate-800 overflow-hidden">
        {detail.users.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">В этой фирме нет пользователей</p>
        ) : detail.users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{u.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{u.email} · {ROLE_LABEL[u.role] ?? u.role}</p>
            </div>
            <button
              onClick={() => handleImpersonate(u.id)}
              disabled={busyUserId === u.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {busyUserId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
              Войти как этот пользователь
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
