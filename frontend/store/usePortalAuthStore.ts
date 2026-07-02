import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PortalAuthState {
  token:          string | null;
  clientId:       string | null;
  clientName:     string | null;
  firmId:         number | null;
  abonentNumber:  number | null;
  _hasHydrated:   boolean;
  login: (data: {
    token: string; clientId: string; clientName: string; firmId: number; abonentNumber: number;
  }) => void;
  logout:         () => void;
  setHasHydrated: (v: boolean) => void;
}

export const usePortalAuthStore = create<PortalAuthState>()(
  persist(
    (set) => ({
      token:         null,
      clientId:      null,
      clientName:    null,
      firmId:        null,
      abonentNumber: null,
      _hasHydrated:  false,
      login: ({ token, clientId, clientName, firmId, abonentNumber }) =>
        set({ token, clientId, clientName, firmId, abonentNumber }),
      logout:         () => set({ token: null, clientId: null, clientName: null, firmId: null, abonentNumber: null }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name:     'portal-auth',
      version:  2,
      onRehydrateStorage: () => (state) => { state?.setHasHydrated(true); },
    },
  ),
);

/** Call from non-React code (api.ts). */
export const getPortalToken = () => usePortalAuthStore.getState().token;
