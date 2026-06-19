'use client';

import { useState } from 'react';
import { Upload, CheckCircle2 } from 'lucide-react';
import { apiFetch, API } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { useClientStore } from '@/store/useClientStore';
import { useChatStore } from '@/store/useChatStore';

const FLAG_KEY = 'local-data-uploaded-v1';

/** One-time manual push of this device's accumulated localStorage data to the server. */
export function LocalDataMigrationBanner() {
  const demoMode = useAppStore((s) => s.demoMode);
  const [done, setDone] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem(FLAG_KEY) === '1',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (demoMode || done) return null;

  const handleUpload = async () => {
    setBusy(true);
    setError(false);
    try {
      const clients  = useClientStore.getState().clients;
      const messages = useChatStore.getState().messages;

      for (const c of clients) {
        await apiFetch(API.clients.create(), { method: 'POST', body: JSON.stringify(c) });
      }
      for (const m of messages) {
        await apiFetch(API.chat.createMessage(), {
          method: 'POST',
          body: JSON.stringify({ ...m, timestamp: new Date(m.timestamp).toISOString() }),
        });
      }
      window.localStorage.setItem(FLAG_KEY, '1');
      setDone(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-2 text-xs flex-shrink-0">
      <Upload className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
      <span className="text-blue-700 flex-1">
        Загрузите накопленные на этом устройстве привязки клиентов и историю чатов на сервер, чтобы они стали видны на других устройствах.
      </span>
      {error && <span className="text-red-600 flex-shrink-0">Ошибка, попробуйте ещё раз</span>}
      <button
        onClick={handleUpload}
        disabled={busy}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex-shrink-0"
      >
        {busy ? 'Загрузка…' : <><CheckCircle2 className="h-3 w-3" /> Загрузить</>}
      </button>
    </div>
  );
}
