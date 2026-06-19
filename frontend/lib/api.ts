import { getAuthToken, getTenantId } from '@/store/useAuthStore';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://159.194.225.55:8018';

/** Fetch wrapper that injects Authorization header when a token is present. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...init, headers });
}

export const API = {
  auth: {
    register: () => `${BASE}/api/v1/auth/register`,
    login:    () => `${BASE}/api/v1/auth/login`,
    me:       () => `${BASE}/api/v1/auth/me`,
    tenant:   () => `${BASE}/api/v1/auth/tenant`,
  },
  telegram: {
    messages:    (limit = 50) => `${BASE}/api/v1/telegram/messages?limit=${limit}`,
    send:        ()           => `${BASE}/api/v1/telegram/send`,
    status:      ()           => `${BASE}/api/v1/telegram/status`,
    recentChats: ()           => `${BASE}/api/v1/telegram/recent-chats`,
  },
  documents: {
    list:           (days = 90) =>
      `${BASE}/api/v1/documents/?tenant_id=${getTenantId()}&days=${days}`,
    sync:           () =>
      `${BASE}/api/v1/documents/sync?tenant_id=${getTenantId()}`,
    counterparties: () =>
      `${BASE}/api/v1/documents/counterparties?tenant_id=${getTenantId()}`,
    print:   (refKey: string) =>
      `${BASE}/api/v1/documents/${refKey}/print?tenant_id=${getTenantId()}`,
    sendNow: (refKey: string) =>
      `${BASE}/api/v1/documents/${refKey}/send-now`,
  },
  portal: {
    setCredentials: () => `${BASE}/api/v1/portal/set-credentials`,
    login:          () => `${BASE}/api/v1/portal/login`,
    credentials:    (clientId: string) =>
      `${BASE}/api/v1/portal/credentials?tenant_id=${getTenantId()}&client_id=${encodeURIComponent(clientId)}`,
    chatSend:    () => `${BASE}/api/v1/portal/chat/send`,
    chatReply:   () => `${BASE}/api/v1/portal/chat/reply`,
    chatInbox:   (sinceId = 0) => `${BASE}/api/v1/portal/chat/inbox?tenant_id=${getTenantId()}&since_id=${sinceId}`,
    chatHistory: (clientId: string) =>
      `${BASE}/api/v1/portal/chat/history?client_id=${encodeURIComponent(clientId)}&tenant_id=1`,
    documents:   (clientId: string) =>
      `${BASE}/api/v1/portal/documents?client_id=${encodeURIComponent(clientId)}&tenant_id=1`,
  },
  clients: {
    list:             () => `${BASE}/api/v1/clients/`,
    create:           () => `${BASE}/api/v1/clients/`,
    delete:           (id: string) => `${BASE}/api/v1/clients/${encodeURIComponent(id)}`,
    setChannel:       (id: string, channel: string) =>
      `${BASE}/api/v1/clients/${encodeURIComponent(id)}/channels/${encodeURIComponent(channel)}`,
    setPortalCreds:   (id: string) => `${BASE}/api/v1/clients/${encodeURIComponent(id)}/portal-credentials`,
    merge:            () => `${BASE}/api/v1/clients/merge`,
  },
  chat: {
    messages:     () => `${BASE}/api/v1/chat/messages`,
    createMessage:() => `${BASE}/api/v1/chat/messages`,
    markDone:     (id: string) => `${BASE}/api/v1/chat/messages/${encodeURIComponent(id)}/done`,
    deleteForClient: (clientId: string) =>
      `${BASE}/api/v1/chat/messages?client_id=${encodeURIComponent(clientId)}`,
  },
  docSchedules: {
    list:   (counterpartyKey?: string) => {
      let u = `${BASE}/api/v1/doc-schedules/?tenant_id=${getTenantId()}`;
      if (counterpartyKey) u += `&counterparty_key=${encodeURIComponent(counterpartyKey)}`;
      return u;
    },
    create: () => `${BASE}/api/v1/doc-schedules/`,
    update: (id: number) => `${BASE}/api/v1/doc-schedules/${id}`,
    toggle: (id: number) => `${BASE}/api/v1/doc-schedules/${id}/toggle`,
    delete: (id: number) => `${BASE}/api/v1/doc-schedules/${id}`,
  },
};

export interface TgApiMessage {
  id:          string;
  chat_id:     number;
  sender_name: string;
  sender_id:   string;
  username:    string;
  text:        string;
  timestamp:   string;
  channel:     'TG';
  read:        boolean;
}

export interface TgMessagesResponse {
  messages: TgApiMessage[];
  total:    number;
}
