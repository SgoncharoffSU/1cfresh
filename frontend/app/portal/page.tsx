'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { usePortalAuthStore } from '@/store/usePortalAuthStore';
import { API } from '@/lib/api';
import { LogoIcon } from '@/components/icons/LogoIcon';

export default function PortalLoginPage() {
  const router = useRouter();
  const { login, clientId, _hasHydrated } = usePortalAuthStore();
  const [loginVal,  setLoginVal]  = useState('');
  const [password,  setPassword]  = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    if (_hasHydrated && clientId) router.replace('/portal/dashboard');
  }, [_hasHydrated, clientId, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(API.portal.login(), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ login: loginVal.trim(), password, tenant_id: 1 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? 'Неверный логин или пароль');
        return;
      }
      const { client_id, client_name } = await res.json();
      login(client_id, client_name);
      router.push('/portal/dashboard');
    } catch {
      setError('Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <LogoIcon className="h-12 w-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-900">Клиентский портал</h1>
          <p className="text-sm text-muted-foreground mt-1">Войдите для доступа к документам и чату</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Логин</Label>
              <Input value={loginVal} onChange={(e) => setLoginVal(e.target.value)}
                placeholder="Ваш логин" className="h-10" autoFocus autoComplete="username" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Пароль</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Пароль" className="h-10" autoComplete="current-password" />
            </div>
            {error && <p className="text-xs text-red-600 text-center">{error}</p>}
            <Button type="submit" className="w-full h-10" disabled={!loginVal || !password || loading}>
              <LogIn className="mr-2 h-4 w-4" />
              {loading ? 'Вход…' : 'Войти'}
            </Button>
          </form>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Данные для входа предоставляет ваш бухгалтер
        </p>
      </div>
    </div>
  );
}
