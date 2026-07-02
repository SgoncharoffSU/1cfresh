'use client';
import { useEffect } from 'react';
import { useAppStore }     from '@/store/useAppStore';
import { useChatStore }    from '@/store/useChatStore';
import { useClientStore }  from '@/store/useClientStore';
import { usePendingStore } from '@/store/usePendingStore';
import { API, apiFetch, TgApiMessage } from '@/lib/api';

const POLL_MS     = 5_000;
const FIRST_DELAY = 800;

export function TelegramInboxPoller() {
  const demoMode = useAppStore((s) => s.demoMode);

  useEffect(() => {
    if (demoMode) {
      usePendingStore.getState().setTgOnline(false);
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const res = await apiFetch(API.telegram.messages(200));
        if (!res.ok) { usePendingStore.getState().setTgOnline(false); return; }

        const data: { messages: TgApiMessage[] } = await res.json();
        usePendingStore.getState().setTgOnline(true);
        if (!data.messages.length) return;

        const { messages: stored, addMessage } = useChatStore.getState();
        const existingIds = new Set(stored.map((m) => m.id));

        for (const tg of data.messages) {
          if (!tg.text) continue;
          if (existingIds.has(tg.id)) continue;

          const client = useClientStore.getState().clients.find(
            (c) => c.channelIds?.TG !== undefined &&
                   String(c.channelIds.TG) === String(tg.chat_id),
          );

          if (client) {
            existingIds.add(tg.id);
            addMessage({
              id:         tg.id,
              channel:    'TG',
              senderId:   tg.sender_id,
              senderName: tg.sender_name || tg.username || String(tg.chat_id),
              text:       tg.text,
              timestamp:  new Date(tg.timestamp),
              read:       false,
              clientId:   client.id,
            });

            // Mirror to portal if client has portal channel linked
            const portalClientId = client.channelIds?.PORTAL;
            if (portalClientId) {
              apiFetch(API.portal.chatMirror(), {
                method: 'POST',
                body:   JSON.stringify({
                  portal_client_id: String(portalClientId),
                  text:             tg.text,
                  source:           'tg',
                }),
              }).catch(() => {});
            }
          }
          // Unknown senders: ChatCRM handles them
        }
      } catch {
        usePendingStore.getState().setTgOnline(false);
      }
    };

    const timeoutId = setTimeout(() => {
      poll();
      intervalId = setInterval(poll, POLL_MS);
    }, FIRST_DELAY);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [demoMode]);

  return null;
}
