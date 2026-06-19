import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TgApiMessage } from '@/lib/api';

interface PendingState {
  groups:             Record<number, TgApiMessage[]>; // chatId → messages (NOT persisted)
  doneIds:            string[];                        // persisted
  tgOnline:           boolean;
  chatView:           'list' | 'chat';
  openChatClientId:   string | null;
  addMessage:         (msg: TgApiMessage) => void;
  removeGroup:        (chatId: number) => void;
  hasId:              (id: string) => boolean;
  markDone:           (id: string) => void;
  setTgOnline:        (v: boolean) => void;
  setChatView:        (v: 'list' | 'chat') => void;
  setOpenChatClientId:(id: string | null) => void;
}

export const usePendingStore = create<PendingState>()(
  persist(
    (set, get) => ({
      groups:           {},
      doneIds:          [],
      tgOnline:         false,
      chatView:         'list',
      openChatClientId: null,

      addMessage: (msg) => set((s) => {
        const existing = s.groups[msg.chat_id] ?? [];
        if (existing.some((m) => m.id === msg.id)) return s;
        return { groups: { ...s.groups, [msg.chat_id]: [...existing, msg] } };
      }),

      removeGroup: (chatId) => set((s) => {
        const next = { ...s.groups };
        delete next[chatId];
        return { groups: next };
      }),

      hasId: (id) => {
        const { groups } = get();
        return Object.values(groups).some((msgs) => msgs.some((m) => m.id === id));
      },

      markDone: (id) => set((s) =>
        s.doneIds.includes(id)
          ? { doneIds: s.doneIds.filter((x) => x !== id) }
          : { doneIds: [...s.doneIds, id] },
      ),

      setTgOnline:        (v)  => set({ tgOnline: v }),
      setChatView:        (v)  => set({ chatView: v }),
      setOpenChatClientId:(id) => set({ openChatClientId: id }),
    }),
    {
      name:    'pending-store',
      version: 1,
      // Only persist doneIds — groups come from live Telegram API
      partialize: (s) => ({ doneIds: s.doneIds }),
    },
  ),
);
