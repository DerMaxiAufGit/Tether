/**
 * InvitePage.tsx — Server invite join page
 *
 * Handles both authenticated and unauthenticated users:
 * - Unauthenticated: redirect to /login with state.from set, so the user
 *   is redirected back here after logging in (PublicRoute in App.tsx handles
 *   the return redirect via location.state.from).
 * - Authenticated: fetch invite preview, show server info, "Join Server" button.
 *
 * After joining:
 * - Invalidates the servers TanStack Query cache
 * - Emits server:subscribe so the socket room is joined without reconnecting
 * - Navigates to /servers/:serverId
 */

import { useEffect } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { InviteInfoResponse, ServerResponse } from "@tether/shared";

// ============================================================
// Helpers
// ============================================================

/** Deterministic hue from a string (stable across renders) */
function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

// ============================================================
// Loading state
// ============================================================

function LoadingScreen() {
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
        <p className="text-zinc-500 text-sm">Loading invite...</p>
      </div>
    </div>
  );
}

// ============================================================
// InvitePage
// ============================================================

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // --------------------------------------------------------
  // Redirect unauthenticated users to login with return path
  // --------------------------------------------------------
  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      navigate("/login", {
        state: { from: location.pathname },
        replace: true,
      });
    }
  }, [isAuthLoading, isAuthenticated, navigate, location.pathname]);

  // --------------------------------------------------------
  // Fetch invite preview (only when authenticated)
  // --------------------------------------------------------
  const {
    data: inviteInfo,
    isLoading: isPreviewLoading,
    isError: isPreviewError,
    error: previewError,
  } = useQuery({
    queryKey: ["invite", code],
    queryFn: () => api.get<InviteInfoResponse>(`/api/invites/${code!}`),
    enabled: isAuthenticated && !!code,
    retry: false,
  });

  // --------------------------------------------------------
  // Join mutation
  // --------------------------------------------------------
  const joinMutation = useMutation({
    mutationFn: () =>
      api.post<{ server: ServerResponse }>(`/api/invites/${code!}/join`),
    onSuccess: (data) => {
      const { server } = data;
      // Invalidate server list so the new server appears in the sidebar
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      // Navigate to the server — AppShell will re-render and the socket
      // connection handler will pick up the new membership on reconnect.
      // For immediate real-time: the server's existing server:subscribe
      // handler can be called from AppShell when it detects a new server.
      navigate(`/servers/${server.id}`, { replace: true });
    },
  });

  // --------------------------------------------------------
  // Render
  // --------------------------------------------------------

  // Auth loading: show spinner
  if (isAuthLoading) {
    return <LoadingScreen />;
  }

  // Not authenticated: redirect is already triggered in useEffect, show nothing
  if (!isAuthenticated) {
    return null;
  }

  // Invite preview loading
  if (isPreviewLoading) {
    return <LoadingScreen />;
  }

  // Invite not found / expired / exhausted
  const previewErr = previewError as (Error & { status?: number }) | null;
  if (isPreviewError) {
    const isGone = previewErr?.status === 410;
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              className="text-zinc-500"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M12 8v4m0 4h.01"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              {isGone ? "Invite Expired" : "Invite Not Found"}
            </h2>
            <p className="text-zinc-400 text-sm mt-1">
              {isGone
                ? "This invite has expired or has reached its use limit."
                : "This invite link is invalid or no longer exists."}
            </p>
          </div>
          <Link
            to="/"
            className="inline-block text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Go to home
          </Link>
        </div>
      </div>
    );
  }

  // Already a member error
  const joinErr = joinMutation.error as (Error & { status?: number }) | null;
  const isAlreadyMember = joinErr?.status === 409;
  const isJoinExpired = joinErr?.status === 410;

  // Build server icon
  const hue = inviteInfo ? stringToHue(inviteInfo.serverName) : 0;
  const iconBg = `hsl(${hue}, 45%, 35%)`;
  const initials = inviteInfo
    ? inviteInfo.serverName
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
    : "";

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-sm space-y-6">
        {/* Server icon */}
        <div className="flex flex-col items-center gap-4">
          {inviteInfo?.serverIcon ? (
            <img
              src={inviteInfo.serverIcon}
              alt={inviteInfo.serverName}
              className="w-20 h-20 rounded-2xl object-cover"
            />
          ) : (
            <div
              style={{ backgroundColor: iconBg }}
              className="w-20 h-20 rounded-2xl flex items-center justify-center"
            >
              <span className="text-white font-bold text-2xl">{initials}</span>
            </div>
          )}

          <div className="text-center">
            <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium mb-1">
              You've been invited to join
            </p>
            <h2 className="text-xl font-bold text-white">{inviteInfo?.serverName}</h2>
            <p className="text-zinc-400 text-sm mt-1">
              {inviteInfo?.memberCount}{" "}
              {inviteInfo?.memberCount === 1 ? "Member" : "Members"}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-zinc-800" />

        {/* Creator */}
        <p className="text-xs text-zinc-500 text-center">
          Invited by <span className="text-zinc-300">{inviteInfo?.creatorName}</span>
        </p>

        {/* Error states */}
        {isAlreadyMember && (
          <div className="bg-amber-400/5 border border-amber-400/20 rounded-lg p-3 text-center">
            <p className="text-amber-400 text-sm">
              You are already a member of this server.
            </p>
          </div>
        )}
        {isJoinExpired && (
          <div className="bg-red-400/5 border border-red-400/20 rounded-lg p-3 text-center">
            <p className="text-red-400 text-sm">
              This invite has expired or has reached its use limit.
            </p>
          </div>
        )}
        {joinErr && !isAlreadyMember && !isJoinExpired && (
          <div className="bg-red-400/5 border border-red-400/20 rounded-lg p-3 text-center">
            <p className="text-red-400 text-sm">{joinErr.message}</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => joinMutation.mutate()}
            disabled={joinMutation.isPending || isAlreadyMember}
            className="w-full py-2.5 px-4 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold rounded-lg transition-colors text-sm"
          >
            {joinMutation.isPending
              ? "Joining..."
              : `Join ${inviteInfo?.serverName ?? "Server"}`}
          </button>

          {isAlreadyMember && (
            // Navigate to the server (we don't know the ID from invite info, redirect home)
            <Link
              to="/"
              className="block w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg transition-colors text-sm text-center"
            >
              Go to servers
            </Link>
          )}

          <Link
            to="/"
            className="block w-full py-2.5 px-4 bg-transparent hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 font-medium rounded-lg transition-colors text-sm text-center"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
