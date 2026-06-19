import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChatMessage, IntegrationKey } from '@/types';
import { apiFetch, API } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';

/** Fire-and-forget background sync to the backend; no-op in demo mode. */
function syncToServer(fn: () => Promise<unknown>) {
  if (useAppStore.getState().demoMode) return;
  fn().catch(() => {});
}

interface ChatState {
  messages:       ChatMessage[];
  activeChannel:  IntegrationKey | 'ALL';
  selectedIds:    string[];
  draft:          string;

  setMessages:      (msgs: ChatMessage[]) => void;
  addMessage:       (msg: ChatMessage) => void;
  setActiveChannel: (ch: IntegrationKey | 'ALL') => void;
  toggleSelect:     (id: string) => void;
  clearSelection:   () => void;
  setDraft:         (text: string) => void;
  remapClientId:        (fromId: string, toId: string) => void;
  markDone:             (id: string) => void;
  removeClientMessages: (clientId: string) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages:      [],
      activeChannel: 'ALL' as const,
      selectedIds:   [],
      draft:         '',

      setMessages:      (messages) => set({ messages }),
      addMessage:       (msg) => {
        let added = false;
        set((s) => {
          if (s.messages.some((m) => m.id === msg.id)) return s; // deduplicate by ID
          added = true;
          return { messages: [...s.messages, msg] };
        });
        if (added) {
          syncToServer(() => apiFetch(API.chat.createMessage(), {
            method: 'POST',
            body: JSON.stringify({
              ...msg,
              timestamp: new Date(msg.timestamp).toISOString(),
            }),
          }));
        }
      },
      setActiveChannel: (activeChannel) => set({ activeChannel, selectedIds: [] }),
      setDraft:         (draft) => set({ draft }),

      toggleSelect: (id) =>
        set((s) => ({
          selectedIds: s.selectedIds.includes(id)
            ? s.selectedIds.filter((x) => x !== id)
            : [...s.selectedIds, id],
        })),

      clearSelection: () => set({ selectedIds: [] }),

      remapClientId: (fromId, toId) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.clientId === fromId ? { ...m, clientId: toId } : m
          ),
        })),

      markDone: (id) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, done: true, doneAt: new Date().toISOString() } : m
          ),
        }));
        syncToServer(() => apiFetch(API.chat.markDone(id), { method: 'PATCH' }));
      },

      removeClientMessages: (clientId) => {
        set((s) => ({
          messages: s.messages.filter((m) => m.clientId !== clientId),
        }));
        syncToServer(() => apiFetch(API.chat.deleteForClient(clientId), { method: 'DELETE' }));
      },
    }),
    {
      name:    'chat-store',
      version: 1,
      partialize: (s) => ({ messages: s.messages }),
    },
  ),
);
