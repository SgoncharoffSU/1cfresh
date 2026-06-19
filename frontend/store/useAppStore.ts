import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppRole = 'ACCOUNTANT' | 'CLIENT';

interface AppState {
  demoMode:       boolean;
  currentRole:    AppRole;
  setDemoMode:    (v: boolean) => void;
  setCurrentRole: (role: AppRole) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      demoMode:    false,
      currentRole: 'ACCOUNTANT',

      setDemoMode:    (demoMode)    => set({ demoMode }),
      setCurrentRole: (currentRole) => set({ currentRole }),
    }),
    { name: 'app-store', version: 1 },
  ),
);
