'use client';
import { useEffect, useRef } from 'react';
import { useAppStore }    from '@/store/useAppStore';
import { useChatStore }   from '@/store/useChatStore';
import { useClientStore } from '@/store/useClientStore';
import { API } from '@/lib/api';

const POLL_MS     = 5_000;
const FIRST_DELAY = 1_200;

interface PortalApiMsg {
  id:               number;
  portal_client_id: string;
  client_name:      string | null;
  text:             string;
  direction:        'inbound' | 'outbound';
  sender_name:      string | null;
  timestamp:        string;
  is_read:          boolean;
}

/**
 * Polls portal chat inbox and adds inbound messages to useChatStore,
 * routing them directly to the matching CRM client by portal_client_id.
 */
export function PortalInboxPoller() {
  const demoMode   = useAppStore((s) => s.demoMode);
  const sinceIdRef = useRef(0);

  useEffect(() => {
    if (demoMode) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(API.portal.chatInbox(sinceIdRef.current));
        if (!res.ok) return;
        const data: { messages: PortalApiMsg[] } = await res.json();
        if (!data.messages.length) return;

        const { messages: stored, addMessage } = useChatStore.getState();
        const { clients, updateChannelId }     = useClientStore.getState();
        const existingIds = new Set(stored.map((m) => m.id));

        for (const pm of data.messages) {
          if (pm.id > sinceIdRef.current) sinceIdRef.current = pm.id;

          const msgId = `portal-${pm.id}`;
          if (existingIds.has(msgId)) continue;

          // 1) match by real client ID (when set via PortalTab UI)
          // 2) match by previously linked PORTAL channel
          // 3) fallback: match by client_name (e.g. manually set portal credentials)
          let client = clients.find((c) => c.id === pm.portal_client_id)
            ?? clients.find((c) => String(c.channelIds?.PORTAL) === pm.portal_client_id);

          if (!client && pm.client_name) {
            const nameLow = pm.client_name.toLowerCase();
            client = clients.find((c) =>
              c.name.toLowerCase() === nameLow ||
              c.name.toLowerCase().includes(nameLow) ||
              nameLow.includes(c.name.toLowerCase()),
            );
          }

          if (!client) continue;

          // Persist PORTAL channel link so future polls and ChatView replies work
          if (!client.channelIds?.PORTAL) {
            updateChannelId(client.id, 'PORTAL', pm.portal_client_id);
          }

          existingIds.add(msgId);
          addMessage({
            id:         msgId,
            channel:    'PORTAL',
            senderId:   pm.portal_client_id,
            senderName: pm.sender_name || pm.client_name || pm.portal_client_id,
            text:       pm.text,
            timestamp:  new Date(pm.timestamp),
            read:       false,
            clientId:   client.id,
          });
        }
      } catch {
        // silent
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
