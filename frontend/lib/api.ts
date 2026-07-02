import { getAuthToken, getTenantId } from '@/store/useAuthStore';
import { getPortalToken } from '@/store/usePortalAuthStore';
import { getSuperAdminToken } from '@/store/useSuperAdminAuthStore';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://159.194.225.55:8018';

/** Fetch wrapper that injects the tier-2 (admin) Authorization header when a token is present. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...init, headers });
}

/** Fetch wrapper for tier-3 (abonent) portal calls — never mixes with the admin token. */
export async function apiFetchPortal(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getPortalToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...init, headers });
}

/** Fetch wrapper for tier-1 (superadmin) calls — never mixes with the admin/abonent token. */
export async function superAdminApiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getSuperAdminToken();
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
    login:          (firmId: number) => `${BASE}/api/v1/portal/${firmId}/login`,
    credentials:    (clientId: string) =>
      `${BASE}/api/v1/portal/credentials?tenant_id=${getTenantId()}&client_id=${encodeURIComponent(clientId)}`,
    chatSend:    () => `${BASE}/api/v1/portal/chat/send`,     // abonent-authenticated (apiFetchPortal)
    chatMirror:  () => `${BASE}/api/v1/portal/chat/mirror`,   // admin-authenticated (apiFetch) — TG mirror
    chatReply:   () => `${BASE}/api/v1/portal/chat/reply`,
    chatInbox:   (sinceId = 0) => `${BASE}/api/v1/portal/chat/inbox?tenant_id=${getTenantId()}&since_id=${sinceId}`,
    chatHistory: () => `${BASE}/api/v1/portal/chat/history`,  // abonent-authenticated (apiFetchPortal)
    documents:   () => `${BASE}/api/v1/portal/documents`,     // abonent-authenticated (apiFetchPortal)
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
  contracts: {
    list: (counterpartyKey?: string) => {
      let u = `${BASE}/api/v1/contracts/?tenant_id=${getTenantId()}`;
      if (counterpartyKey) u += `&counterparty_key=${encodeURIComponent(counterpartyKey)}`;
      return u;
    },
    get:             (refKey: string) =>
      `${BASE}/api/v1/contracts/${encodeURIComponent(refKey)}?tenant_id=${getTenantId()}`,
    upsertSchedule:  (refKey: string, target = 'all', basis = 'CONTRACT') =>
      `${BASE}/api/v1/contracts/${encodeURIComponent(refKey)}/schedule?tenant_id=${getTenantId()}&target=${target}&basis=${basis}`,
    deleteSchedule:  (refKey: string, target = 'all') =>
      `${BASE}/api/v1/contracts/${encodeURIComponent(refKey)}/schedule?tenant_id=${getTenantId()}&target=${target}`,
    listSchedules:   (refKey: string) =>
      `${BASE}/api/v1/contracts/${encodeURIComponent(refKey)}/schedules?tenant_id=${getTenantId()}`,
    sync:            () =>
      `${BASE}/api/v1/contracts/sync?tenant_id=${getTenantId()}`,
    updateFields:    (refKey: string, target = 'all') =>
      `${BASE}/api/v1/contracts/${encodeURIComponent(refKey)}/schedule/custom-fields?tenant_id=${getTenantId()}&target=${target}`,
    nomenclature: () =>
      `${BASE}/api/v1/contracts/nomenclature?tenant_id=${getTenantId()}`,
  },
  billing: {
    status:        () => `${BASE}/api/v1/billing/status`,
    createPayment: () => `${BASE}/api/v1/billing/create-payment`,
    webhook:       () => `${BASE}/api/v1/billing/webhook`,
  },
  superadmin: {
    login:       () => `${BASE}/api/v1/superadmin/login`,
    firms:       () => `${BASE}/api/v1/superadmin/firms`,
    firmDetail:  (firmId: number) => `${BASE}/api/v1/superadmin/firms/${firmId}`,
    impersonate: (firmId: number) => `${BASE}/api/v1/superadmin/firms/${firmId}/impersonate`,
    audit:       () => `${BASE}/api/v1/superadmin/audit`,
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
