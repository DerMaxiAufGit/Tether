/**
 * useAuth.ts — Auth state management via React context
 *
 * Provides:
 *   - AuthProvider: wraps app, handles silent refresh on mount
 *   - useAuth(): hook for accessing auth state + actions
 *
 * Auth state lives here; access token lives in api.ts (module var).
 * On mount, attempts a silent token refresh to restore sessions across
 * page reloads (the refresh token httpOnly cookie enables this).
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { setAccessToken, clearAccessToken, silentRefreshSession, api } from "@/lib/api";
import { restoreKeys, clearKeys, terminateWorker } from "@/lib/crypto";

// ============================================================
// Types
// ============================================================

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  x25519PublicKey: string; // base64 — used to include self in recipient list when sending messages
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True when the crypto worker has keys loaded (either from loginDecrypt or restoreKeys). */
  keysRestored: boolean;
}

interface AuthContextValue extends AuthState {
  login: (accessToken: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  /** Called by CryptoUnlockPrompt after a successful loginDecrypt to mark keys as available. */
  setKeysRestored: (restored: boolean) => void;
}

// ============================================================
// Context
// ============================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================
// Provider
// ============================================================

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true, // start loading — silent refresh in progress
    keysRestored: false,
  });

  // Silent auth check on mount — tries to restore session via refresh cookie.
  //
  // Uses silentRefreshSession() from api.ts which deduplicates concurrent
  // calls at the module level.  This is essential because React StrictMode
  // double-mounts components in development, and sending two concurrent
  // refresh requests with the same token triggers the server's replay-attack
  // detection (which revokes ALL refresh tokens for the user).
  //
  // The deduplication ensures only ONE network request is made; both mounts
  // share the same promise.  The `cancelled` flag ensures only the surviving
  // mount applies the result to state.
  useEffect(() => {
    let cancelled = false;

    async function attemptRestore() {
      try {
        const result = await silentRefreshSession();
        if (!result) {
          // No valid refresh cookie — user is not logged in (this is normal)
          if (!cancelled) {
            setState({ user: null, isAuthenticated: false, isLoading: false, keysRestored: false });
          }
          return;
        }
        // Access token is now set; fetch the full user profile
        const meData = await api.get<{ user: AuthUser }>("/api/auth/me");

        // Try to restore crypto keys from IndexedDB (avoids password re-entry on reload).
        // If restored: false, the user will be prompted for their password in ChannelView.
        let keysRestored = false;
        try {
          const restoreResult = await restoreKeys();
          keysRestored = restoreResult.restored;
        } catch {
          // IndexedDB unavailable or key load failed — user will re-enter password
          keysRestored = false;
        }

        if (!cancelled) {
          setState({
            user: meData.user,
            isAuthenticated: true,
            isLoading: false,
            keysRestored,
          });
        }
      } catch {
        if (!cancelled) {
          setState({ user: null, isAuthenticated: false, isLoading: false, keysRestored: false });
        }
      }
    }

    void attemptRestore();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((accessToken: string, user: AuthUser) => {
    setAccessToken(accessToken);
    // loginDecrypt is called by the caller (LoginPage) before invoking login(),
    // so keys are already loaded in the worker at this point.
    setState({ user, isAuthenticated: true, isLoading: false, keysRestored: true });
  }, []);

  const setKeysRestored = useCallback((restored: boolean) => {
    setState((prev) => ({ ...prev, keysRestored: restored }));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // Ignore errors on logout — we're clearing state regardless
    }
    // Clear crypto keys from IndexedDB and terminate the worker
    try { await clearKeys(); } catch { /* worker may already be dead */ }
    terminateWorker();
    clearAccessToken();
    setState({ user: null, isAuthenticated: false, isLoading: false, keysRestored: false });
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    setKeysRestored,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================
// Hook
// ============================================================

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
