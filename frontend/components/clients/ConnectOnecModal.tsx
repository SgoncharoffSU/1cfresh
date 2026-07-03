'use client';

import { useState } from 'react';
import { X, Database, Loader2, AlertCircle } from 'lucide-react';
import { API, apiFetch } from '@/lib/api';

interface Props {
  /** null → create a new client together with this connection. */
  clientId:     string | null;
  initialName?: string;
  onClose:      () => void;
  onConnected:  (result: { client_id: string; connected: boolean; name: string; inn?: string }) => void;
  /** Only called when creating a new client WITHOUT connecting 1C (checkbox unchecked). */
  onCreatePlain?: (name: string, inn?: string) => void;
}

export function ConnectOnecModal({ clientId, initialName, onClose, onConnected, onCreatePlain }: Props) {
  const [name,     setName]     = useState(initialName ?? '');
  const [inn,      setInn]      = useState('');
  const [odataUrl,      setOdataUrl]      = useState('');
  const [odataLogin,    setOdataLogin]    = useState('');
  const [odataPassword, setOdataPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const isNewClient = !clientId;
  const [wantsOnec, setWantsOnec] = useState(true);
  const connectingOnec = !isNewClient || wantsOnec;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (isNewClient && !wantsOnec) {
      if (!name.trim()) { setError('Укажите название клиента'); return; }
      onCreatePlain?.(name.trim(), inn.trim() || undefined);
      onClose();
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch(API.clients.onecConnect(), {
        method: 'POST',
        body: JSON.stringify({
          client_id:      clientId,
          name:           isNewClient ? name.trim() : undefined,
          inn:            isNewClient ? (inn.trim() || undefined) : undefined,
          odata_url:      odataUrl.trim(),
          odata_login:    odataLogin.trim(),
          odata_password: odataPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail ?? 'Ошибка подключения'); return; }
      if (!data.connected) {
        setError('Клиент сохранён, но подключиться к 1С не удалось — проверьте адрес и учётные данные.');
      }
      onConnected({ client_id: data.client_id, connected: data.connected, name: name.trim(), inn: inn.trim() || undefined });
      if (data.connected) onClose();
    } catch {
      setError('Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70]
                      w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {isNewClient ? 'Новый клиент' : 'Подключение 1С:Фреш'}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              У каждого клиента — своя база 1С:Фреш
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {isNewClient && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Название клиента <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ООО «Ромашка»"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ИНН</label>
                <input
                  type="text"
                  value={inn}
                  onChange={(e) => setInn(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="7700000000"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wantsOnec}
                  onChange={(e) => setWantsOnec(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
                Подключить 1С:Фреш сейчас
              </label>
              <hr className="border-slate-100" />
            </>
          )}

          {connectingOnec && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  URL OData-сервиса <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={odataUrl}
                  onChange={(e) => setOdataUrl(e.target.value)}
                  required={connectingOnec}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://msk1.1cfresh.com/a/ea/XXXXXXX/odata/standard.odata"
                />
                <p className="text-[11px] text-slate-400 mt-1">Настройки → Интеграция → OData → Адрес сервиса</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Пользователь</label>
                  <input
                    type="text"
                    value={odataLogin}
                    onChange={(e) => setOdataLogin(e.target.value)}
                    required={connectingOnec}
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
                    required={connectingOnec}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            {loading ? 'Проверяем…' : connectingOnec ? 'Подключить и проверить' : 'Добавить клиента'}
          </button>
        </form>
      </div>
    </>
  );
}
