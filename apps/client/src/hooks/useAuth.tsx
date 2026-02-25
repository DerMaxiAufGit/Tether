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
import { useNavigate } from "react-router-dom";
import { setAccessToken, clearAccessToken, api } from "@/lib/api";

// ============================================================
// Types
// ============================================================

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (accessToken: string, user: AuthUser) => void;
  logout: () => Promise<void>;
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
  });

  const navigate = useNavigate();

  // Silent auth check on mount — tries to restore session via refresh cookie
  useEffect(() => {
    let cancelled = false;

    async function silentRefresh() {
      try {
        const data = await api.post<{ accessToken: string; user: AuthUser }>(
          "/api/auth/refresh",
        );
        if (!cancelled) {
          setAccessToken(data.accessToken);
          setState({
            user: data.user,
            isAuthenticated: true,
            isLoading: false,
          });
        }
      } catch {
        // No valid refresh cookie — user is not logged in (this is normal)
        if (!cancelled) {
          setState({ user: null, isAuthenticated: false, isLoading: false });
        }
      }
    }

    void silentRefresh();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((accessToken: string, user: AuthUser) => {
    setAccessToken(accessToken);
    setState({ user, isAuthenticated: true, isLoading: false });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // Ignore errors on logout — we're clearing state regardless
    }
    clearAccessToken();
    setState({ user: null, isAuthenticated: false, isLoading: false });
    navigate("/login");
  }, [navigate]);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
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
