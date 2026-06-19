import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { IntegrationKey } from '@/types';
import { REAL_CLIENT } from '@/constants/client';
import { apiFetch, API } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';

/** Fire-and-forget background sync to the backend; no-op in demo mode. */
function syncToServer(fn: () => Promise<unknown>) {
  if (useAppStore.getState().demoMode) return;
  fn().catch(() => {});
}

export interface ClientContact {
  id:              string;
  name:            string;
  shortName:       string;
  inn?:            string;
  initials:        string;
  color:           string;
  activeChannels:  IntegrationKey[];
  channelIds:      Partial<Record<IntegrationKey, string | number>>;
  portalLogin?:    string;
  portalPassword?: string;
}

const PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
];

export const REAL_CLIENTS: ClientContact[] = [
  {
    id:             REAL_CLIENT.id,
    name:           REAL_CLIENT.name,
    shortName:      REAL_CLIENT.shortName,
    inn:            REAL_CLIENT.inn,
    initials:       REAL_CLIENT.initials,
    color:          PALETTE[0],
    activeChannels: ['TG'],
    channelIds:     {},
  },
];

let _seq = 0;

interface ApiCounterparty { id: string; name: string; inn: string }

interface ClientState {
  clients:    ClientContact[];
  selectedId: string | null;

  setClients:      (c: ClientContact[]) => void;
  select:          (id: string | null) => void;
  addClient:       (c: Omit<ClientContact, 'id' | 'color'>) => string;
  removeClient:    (id: string) => void;
  updateChannelId:       (clientId: string, ch: IntegrationKey, chId: string | number) => void;
  updatePortalCredentials:(clientId: string, login: string, password: string) => void;
  mergeClients:          (keepId: string, removeId: string) => void;
  addFromApi:            (counterparties: ApiCounterparty[]) => void;
}

export const useClientStore = create<ClientState>()(
  persist(
    (set, get) => ({
      clients:    REAL_CLIENTS,
      selectedId: REAL_CLIENTS[0]?.id ?? null,

      setClients: (clients) => set({ clients, selectedId: clients[0]?.id ?? null }),

      select: (selectedId) => set({ selectedId }),

      addClient: (c) => {
        const id    = `client-${Date.now()}-${_seq++}`;
        const color = PALETTE[get().clients.length % PALETTE.length];
        const full  = { ...c, id, color };
        set((s) => ({ clients: [...s.clients, full] }));
        syncToServer(() => apiFetch(API.clients.create(), { method: 'POST', body: JSON.stringify(full) }));
        return id;
      },

      removeClient: (id) => {
        set((s) => ({
          clients:    s.clients.filter((c) => c.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        }));
        syncToServer(() => apiFetch(API.clients.delete(id), { method: 'DELETE' }));
      },

      updateChannelId: (clientId, ch, chId) => {
        set((s) => ({
          clients: s.clients.map((c) =>
            c.id !== clientId ? c : {
              ...c,
              channelIds:     { ...c.channelIds, [ch]: chId },
              activeChannels: c.activeChannels.includes(ch)
                ? c.activeChannels
                : [...c.activeChannels, ch],
            }
          ),
        }));
        syncToServer(() => apiFetch(API.clients.setChannel(clientId, ch), {
          method: 'PUT', body: JSON.stringify({ channelRef: String(chId) }),
        }));
      },

      updatePortalCredentials: (clientId, login, password) => {
        set((s) => ({
          clients: s.clients.map((c) =>
            c.id !== clientId ? c : { ...c, portalLogin: login, portalPassword: password }
          ),
        }));
        syncToServer(() => apiFetch(API.clients.setPortalCreds(clientId), {
          method: 'PUT', body: JSON.stringify({ login, password }),
        }));
      },

      mergeClients: (keepId, removeId) => {
        set((s) => {
          const keep   = s.clients.find((c) => c.id === keepId);
          const remove = s.clients.find((c) => c.id === removeId);
          if (!keep || !remove) return s;
          return {
            clients: s.clients
              .filter((c) => c.id !== removeId)
              .map((c) => c.id !== keepId ? c : {
                ...c,
                channelIds:     { ...remove.channelIds, ...keep.channelIds },
                activeChannels: keep.activeChannels.concat(
                  remove.activeChannels.filter((ch) => !keep.activeChannels.includes(ch))
                ),
              }),
            selectedId: keepId,
          };
        });
        syncToServer(() => apiFetch(API.clients.merge(), {
          method: 'POST', body: JSON.stringify({ keepId, removeId }),
        }));
      },

      addFromApi: (counterparties) => {
        const s = get();
        const existing = new Set(s.clients.map((c) => c.id));
        const fresh = counterparties
          .filter((cp) => !existing.has(cp.id) && cp.name)
          .map((cp, i) => {
            const words    = cp.name.trim().split(/\s+/);
            const initials = words.map((w) => w[0]).join('').slice(0, 2).toUpperCase();
            return {
              id:             cp.id,
              name:           cp.name,
              shortName:      words.slice(0, 2).join(' '),
              inn:            cp.inn || undefined,
              initials,
              color:          PALETTE[(s.clients.length + i) % PALETTE.length],
              activeChannels: ['1C' as IntegrationKey],
              channelIds:     { '1C': cp.id },
            } satisfies ClientContact;
          });
        if (fresh.length === 0) return;
        set((s2) => ({ clients: [...s2.clients, ...fresh] }));
        for (const c of fresh) {
          syncToServer(() => apiFetch(API.clients.create(), { method: 'POST', body: JSON.stringify(c) }));
        }
      },
    }),
    { name: 'client-store', version: 1 },
  ),
);
