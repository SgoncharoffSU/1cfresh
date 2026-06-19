import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PortalAuthState {
  clientId:       string | null;
  clientName:     string | null;
  _hasHydrated:   boolean;
  login:          (clientId: string, name: string) => void;
  logout:         () => void;
  setHasHydrated: (v: boolean) => void;
}

export const usePortalAuthStore = create<PortalAuthState>()(
  persist(
    (set) => ({
      clientId:     null,
      clientName:   null,
      _hasHydrated: false,
      login:          (clientId, clientName) => set({ clientId, clientName }),
      logout:         () => set({ clientId: null, clientName: null }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name:     'portal-auth',
      version:  1,
      onRehydrateStorage: () => (state) => { state?.setHasHydrated(true); },
    },
  ),
);
