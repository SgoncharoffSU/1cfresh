import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'CHIEF_ACCOUNTANT' | 'ACCOUNTANT';

export interface AuthUser {
  id:        number;
  firmId:    number;
  tenantId:  number | null;
  name:      string;
  email:     string;
  role:      UserRole;
  firmName:  string;
  firmInn:   string | null;
  firmPlan:  string;
}

interface AuthState {
  token:          string | null;
  user:           AuthUser | null;
  _hasHydrated:   boolean;
  setAuth:        (token: string, user: AuthUser) => void;
  setUser:        (user: AuthUser) => void;
  logout:         () => void;
  isAuthed:       () => boolean;
  setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token:        null,
      user:         null,
      _hasHydrated: false,

      setAuth: (token, user) => set({ token, user }),
      setUser: (user)        => set({ user }),
      logout:  ()            => set({ token: null, user: null }),
      isAuthed: ()           => !!get().token && !!get().user,
      setHasHydrated: (v)    => set({ _hasHydrated: v }),
    }),
    {
      name: 'auth-store',
      version: 1,
      partialize: (s) => ({ token: s.token, user: s.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/** Call from non-React code (api.ts). */
export const getAuthToken = () => useAuthStore.getState().token;
export const getTenantId  = () => useAuthStore.getState().user?.tenantId ?? 1;
