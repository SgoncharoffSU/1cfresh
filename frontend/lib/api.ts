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

/** Every non-1C field the КС-2/КС-3 print forms need — see app/api/act_forms.py's
 * FieldsQuery / REMEMBERED_FIELDS on the backend for the matching shape. */
export interface ActFormFields {
  objectName:         string;
  contractNumber:     string;
  contractDate:       string;
  periodFrom:         string;
  periodTo:           string;
  stroikaName:        string;
  podryadchikAddress: string;
  podryadchikPhone:   string;
  podryadchikOkpo:    string;
  zakazchikAddress:   string;
  zakazchikPhone:     string;
  zakazchikOkpo:      string;
  investorName:       string;
  investorAddress:    string;
  investorOkpo:       string;
  okdp:               string;
}

export const EMPTY_ACT_FORM_FIELDS: ActFormFields = {
  objectName: '', contractNumber: '', contractDate: '', periodFrom: '', periodTo: '',
  stroikaName: '', podryadchikAddress: '', podryadchikPhone: '', podryadchikOkpo: '',
  zakazchikAddress: '', zakazchikPhone: '', zakazchikOkpo: '',
  investorName: '', investorAddress: '', investorOkpo: '', okdp: '',
};

function actFieldsToQuery(clientId: string, fields: ActFormFields): string {
  const qs = new URLSearchParams({ client_id: clientId });
  const map: Record<keyof ActFormFields, string> = {
    objectName: 'object', contractNumber: 'contract_number', contractDate: 'contract_date',
    periodFrom: 'period_from', periodTo: 'period_to', stroikaName: 'stroika_name',
    podryadchikAddress: 'podryadchik_address', podryadchikPhone: 'podryadchik_phone', podryadchikOkpo: 'podryadchik_okpo',
    zakazchikAddress: 'zakazchik_address', zakazchikPhone: 'zakazchik_phone', zakazchikOkpo: 'zakazchik_okpo',
    investorName: 'investor_name', investorAddress: 'investor_address', investorOkpo: 'investor_okpo',
    okdp: 'okdp',
  };
  (Object.keys(map) as (keyof ActFormFields)[]).forEach((k) => {
    if (fields[k]) qs.set(map[k], fields[k]);
  });
  return qs.toString();
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
  // Each client has their own 1C connection now, so every documents/contracts/
  // doc-schedules call is scoped by client_id (resolved server-side to that
  // client's own tenant via get_client_tenant), not a firm-wide tenant_id.
  documents: {
    list:           (clientId: string, days = 90) =>
      `${BASE}/api/v1/documents/?client_id=${encodeURIComponent(clientId)}&days=${days}`,
    sync:           (clientId: string) =>
      `${BASE}/api/v1/documents/sync?client_id=${encodeURIComponent(clientId)}`,
    counterparties: (clientId: string) =>
      `${BASE}/api/v1/documents/counterparties?client_id=${encodeURIComponent(clientId)}`,
    print:   (clientId: string, refKey: string) =>
      `${BASE}/api/v1/documents/${refKey}/print?client_id=${encodeURIComponent(clientId)}`,
    sendNow: (clientId: string, refKey: string) =>
      `${BASE}/api/v1/documents/${refKey}/send-now?client_id=${encodeURIComponent(clientId)}`,
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
    onecConnect:      () => `${BASE}/api/v1/clients/onec-connect`,
  },
  chat: {
    messages:     () => `${BASE}/api/v1/chat/messages`,
    createMessage:() => `${BASE}/api/v1/chat/messages`,
    markDone:     (id: string) => `${BASE}/api/v1/chat/messages/${encodeURIComponent(id)}/done`,
    deleteForClient: (clientId: string) =>
      `${BASE}/api/v1/chat/messages?client_id=${encodeURIComponent(clientId)}`,
  },
  contracts: {
    list: (clientId: string, counterpartyKey?: string) => {
      let u = `${BASE}/api/v1/contracts/?client_id=${encodeURIComponent(clientId)}`;
      if (counterpartyKey) u += `&counterparty_key=${encodeURIComponent(counterpartyKey)}`;
      return u;
    },
    get:             (clientId: string, refKey: string) =>
      `${BASE}/api/v1/contracts/${encodeURIComponent(refKey)}?client_id=${encodeURIComponent(clientId)}`,
    upsertSchedule:  (clientId: string, refKey: string, target = 'all', basis = 'CONTRACT') =>
      `${BASE}/api/v1/contracts/${encodeURIComponent(refKey)}/schedule?client_id=${encodeURIComponent(clientId)}&target=${target}&basis=${basis}`,
    deleteSchedule:  (clientId: string, refKey: string, target = 'all') =>
      `${BASE}/api/v1/contracts/${encodeURIComponent(refKey)}/schedule?client_id=${encodeURIComponent(clientId)}&target=${target}`,
    listSchedules:   (clientId: string, refKey: string) =>
      `${BASE}/api/v1/contracts/${encodeURIComponent(refKey)}/schedules?client_id=${encodeURIComponent(clientId)}`,
    sync:            (clientId: string) =>
      `${BASE}/api/v1/contracts/sync?client_id=${encodeURIComponent(clientId)}`,
    updateFields:    (clientId: string, refKey: string, target = 'all') =>
      `${BASE}/api/v1/contracts/${encodeURIComponent(refKey)}/schedule/custom-fields?client_id=${encodeURIComponent(clientId)}&target=${target}`,
    nomenclature: (clientId: string) =>
      `${BASE}/api/v1/contracts/nomenclature?client_id=${encodeURIComponent(clientId)}`,
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
    activity:    (params: { limit?: number; offset?: number; firmId?: number; actorType?: string; action?: string } = {}) => {
      const qs = new URLSearchParams();
      if (params.limit)     qs.set('limit',      String(params.limit));
      if (params.offset)    qs.set('offset',     String(params.offset));
      if (params.firmId)    qs.set('firm_id',    String(params.firmId));
      if (params.actorType) qs.set('actor_type', params.actorType);
      if (params.action)    qs.set('action',     params.action);
      const q = qs.toString();
      return `${BASE}/api/v1/superadmin/activity${q ? `?${q}` : ''}`;
    },
  },
  employees: {
    list:         () => `${BASE}/api/v1/employees/`,
    create:       () => `${BASE}/api/v1/employees/`,
    toggleActive: (id: number) => `${BASE}/api/v1/employees/${id}/toggle-active`,
  },
  actForms: {
    fieldValues: (clientId: string, fields: string[]) =>
      `${BASE}/api/v1/act-forms/field-values?client_id=${encodeURIComponent(clientId)}&fields=${encodeURIComponent(fields.join(','))}`,
    prefill: (clientId: string, refKey: string) =>
      `${BASE}/api/v1/act-forms/${encodeURIComponent(refKey)}/prefill?client_id=${encodeURIComponent(clientId)}`,
    ks2: (clientId: string, refKey: string, fields: ActFormFields) =>
      `${BASE}/api/v1/act-forms/${encodeURIComponent(refKey)}/ks2?${actFieldsToQuery(clientId, fields)}`,
    ks3: (clientId: string, refKey: string, fields: ActFormFields) =>
      `${BASE}/api/v1/act-forms/${encodeURIComponent(refKey)}/ks3?${actFieldsToQuery(clientId, fields)}`,
  },
  docSchedules: {
    list:   (clientId: string, counterpartyKey?: string) => {
      let u = `${BASE}/api/v1/doc-schedules/?client_id=${encodeURIComponent(clientId)}`;
      if (counterpartyKey) u += `&counterparty_key=${encodeURIComponent(counterpartyKey)}`;
      return u;
    },
    create: (clientId: string) => `${BASE}/api/v1/doc-schedules/?client_id=${encodeURIComponent(clientId)}`,
    update: (clientId: string, id: number) => `${BASE}/api/v1/doc-schedules/${id}?client_id=${encodeURIComponent(clientId)}`,
    toggle: (clientId: string, id: number) => `${BASE}/api/v1/doc-schedules/${id}/toggle?client_id=${encodeURIComponent(clientId)}`,
    delete: (clientId: string, id: number) => `${BASE}/api/v1/doc-schedules/${id}?client_id=${encodeURIComponent(clientId)}`,
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
