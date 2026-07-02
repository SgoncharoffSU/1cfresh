import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SuperAdminUser {
  id:    number;
  name:  string;
  email: string;
}

interface SuperAdminAuthState {
  token:          string | null;
  superAdmin:     SuperAdminUser | null;
  _hasHydrated:   boolean;
  setAuth:        (token: string, superAdmin: SuperAdminUser) => void;
  logout:         () => void;
  setHasHydrated: (v: boolean) => void;
}

// Deliberately a distinct store + persist key from useAuthStore/usePortalAuthStore —
// a superadmin session must never share storage with a tier-2 or tier-3 session.
export const useSuperAdminAuthStore = create<SuperAdminAuthState>()(
  persist(
    (set) => ({
      token:        null,
      superAdmin:   null,
      _hasHydrated: false,

      setAuth: (token, superAdmin) => set({ token, superAdmin }),
      logout:  ()                  => set({ token: null, superAdmin: null }),
      setHasHydrated: (v)          => set({ _hasHydrated: v }),
    }),
    {
      name: 'superadmin-auth-store',
      version: 1,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/** Call from non-React code (api.ts). */
export const getSuperAdminToken = () => useSuperAdminAuthStore.getState().token;
