import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import InvitePage from "@/pages/invite/InvitePage";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import RegisterPage from "@/pages/auth/RegisterPage";
import LoginPage from "@/pages/auth/LoginPage";
import ChangePasswordPage from "@/pages/auth/ChangePasswordPage";
import RecoveryKeyPage from "@/pages/auth/RecoveryKeyPage";
import WelcomePage from "@/pages/WelcomePage";
import AppShell from "@/pages/AppShell";
import ServerView from "@/pages/server/ServerView";
import ServerSettings from "@/pages/server/settings/ServerSettings";
import DMLayout from "@/pages/dm/DMLayout";
import DMView from "@/pages/dm/DMView";
import ChannelOrVoiceView from "@/pages/server/ChannelOrVoiceView";

// ============================================================
// Route guards
// ============================================================

/** Redirects authenticated users away from public auth routes */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (isAuthenticated) {
    // Redirect to intended destination or home
    const from = (location.state as { from?: string })?.from ?? "/";
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
}

/** Redirects unauthenticated users to /login */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

/** Full-page loading spinner shown during silent refresh */
function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            className="text-cyan-400 animate-spin"
            style={{ animationDuration: "1.5s" }}
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="31.4 31.4"
              strokeDashoffset="15"
            />
          </svg>
        </div>
        <p className="text-zinc-500 text-sm">Restoring session...</p>
      </div>
    </div>
  );
}

// ============================================================
// App routes
// ============================================================

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes (redirect to / if authenticated) */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />

      {/* Recovery key page — accessible after registration (no auth guard, but
          redirects to / if no recovery key in router state) */}
      <Route path="/recovery-key" element={<RecoveryKeyPage />} />

      {/* Protected routes */}
      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePasswordPage />
          </ProtectedRoute>
        }
      />

      {/* Main app shell — authenticated layout with nested routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        {/* No server selected — show welcome / empty state */}
        <Route index element={<WelcomePage />} />
        {/* Server selected — show server view (channel panel + chat area) */}
        <Route path="servers/:serverId" element={<ServerView />}>
          {/* No channel selected — show placeholder */}
          <Route
            index
            element={
              <div className="flex-1 flex items-center justify-center h-full">
                <p className="text-zinc-500 text-sm">Select a channel to start chatting</p>
              </div>
            }
          />
          {/* Channel selected — text chat (Phase 3) or voice channel (Phase 5) */}
          <Route path="channels/:channelId" element={<ChannelOrVoiceView />} />
        </Route>
        {/* Server settings — full-page, inside AppShell so icon strip stays visible */}
        <Route path="servers/:serverId/settings" element={<ServerSettings />} />
        {/* DM section — sibling to servers/:serverId, both under AppShell */}
        <Route path="dms" element={<DMLayout />}>
          {/* No conversation selected — show centered placeholder */}
          <Route
            index
            element={
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-zinc-400 text-sm font-medium">No conversation selected</p>
                  <p className="text-zinc-600 text-xs mt-1">
                    Select a conversation or start a new one
                  </p>
                </div>
              </div>
            }
          />
          {/* Conversation selected — DM view */}
          <Route path=":channelId" element={<DMView />} />
        </Route>
      </Route>

      {/* Invite route — public (auto-redirects to login if not authed) */}
      <Route path="invite/:code" element={<InvitePage />} />

      {/* Catch-all: redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ============================================================
// Root
// ============================================================

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
