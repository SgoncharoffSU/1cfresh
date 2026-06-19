'use client';

import { useEffect, useRef } from 'react';
import { apiFetch, API } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import { useClientStore, ClientContact } from '@/store/useClientStore';
import { useChatStore } from '@/store/useChatStore';
import { ChatMessage } from '@/types';

/** Hydrates client bindings + chat history from the server on login, so they're shared across devices. */
export function StoreInitializer() {
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);
  const token        = useAuthStore((s) => s.token);
  const userId       = useAuthStore((s) => s.user?.id);
  const demoMode     = useAppStore((s) => s.demoMode);
  const loadedForUser = useRef<number | null>(null);

  useEffect(() => {
    if (!_hasHydrated || !token || demoMode) return;
    if (loadedForUser.current === userId) return;
    loadedForUser.current = userId ?? null;

    (async () => {
      try {
        const [clientsRes, messagesRes] = await Promise.all([
          apiFetch(API.clients.list()),
          apiFetch(API.chat.messages()),
        ]);
        if (clientsRes.ok) {
          const { clients } = await clientsRes.json() as { clients: ClientContact[] };
          useClientStore.getState().setClients(clients);
        }
        if (messagesRes.ok) {
          const { messages } = await messagesRes.json() as { messages: Array<Omit<ChatMessage, 'timestamp'> & { timestamp: string }> };
          useChatStore.getState().setMessages(
            messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })),
          );
        }
      } catch {
        // offline or server unreachable — keep whatever was already in localStorage
      }
    })();
  }, [_hasHydrated, token, userId, demoMode]);

  return null;
}
