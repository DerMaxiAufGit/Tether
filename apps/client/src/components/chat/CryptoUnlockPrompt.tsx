/**
 * CryptoUnlockPrompt.tsx — Password re-entry prompt for post-reload crypto unlock
 *
 * Shown as a full-area overlay within the channel view when the crypto worker
 * does not have keys loaded (e.g. after a page reload where silent refresh
 * restored the session token but the worker's in-memory keys were lost).
 *
 * Flow:
 *   1. Fetch key bundle from /api/auth/me/keys
 *   2. Call loginDecrypt(password, keyBundle) which runs PBKDF2 + AES-GCM unwrap in the worker
 *   3. On success: invoke onUnlocked() — ChannelView dismisses the prompt
 *   4. On error: show "Incorrect password" inline
 */

import { useState } from "react";
import { loginDecrypt } from "@/lib/crypto";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

// ============================================================
// Types
// ============================================================

interface KeyBundle {
  salt: string;
  x25519EncryptedPrivateKey: string;
  x25519KeyIv: string;
  ed25519EncryptedPrivateKey: string;
  ed25519KeyIv: string;
}

interface CryptoUnlockPromptProps {
  onUnlocked: () => void;
}

// ============================================================
// CryptoUnlockPrompt
// ============================================================

export default function CryptoUnlockPrompt({ onUnlocked }: CryptoUnlockPromptProps) {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();

    if (!password.trim()) return;

    setError(null);
    setIsUnlocking(true);

    try {
      // Fetch the encrypted key bundle from the server
      const keyBundle = await api.get<KeyBundle>("/api/auth/me/keys");

      // Re-derive keys in the worker using the entered password
      await loginDecrypt(password, {
        salt: keyBundle.salt,
        x25519Blob: keyBundle.x25519EncryptedPrivateKey,
        x25519Iv: keyBundle.x25519KeyIv,
        ed25519Blob: keyBundle.ed25519EncryptedPrivateKey,
        ed25519Iv: keyBundle.ed25519KeyIv,
      });

      // Success — keys are now cached in the worker
      onUnlocked();
    } catch (err) {
      const error = err as Error;
      const isWrongPassword =
        error.message?.toLowerCase().includes("decrypt") ||
        error.message?.toLowerCase().includes("tag") ||
        error.message?.toLowerCase().includes("invalid");
      setError(isWrongPassword ? "Incorrect password. Please try again." : "Failed to unlock. Please try again.");
    } finally {
      setIsUnlocking(false);
    }
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/95 backdrop-blur-sm z-20">
      <div className="w-full max-w-sm mx-4">
        <div className="bg-zinc-850 border border-zinc-700/50 rounded-2xl p-8 text-center">
          {/* Lock icon */}
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-cyan-400"
              >
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
              </svg>
            </div>
          </div>

          <h2 className="text-lg font-semibold text-zinc-100 mb-1">
            Unlock encrypted messages
          </h2>
          <p className="text-sm text-zinc-400 mb-6">
            Enter your password to decrypt messages
            {user?.email ? ` for ${user.email}` : ""}.
          </p>

          <form onSubmit={handleUnlock} className="space-y-3 text-left">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                disabled={isUnlocking}
                autoFocus
                autoComplete="current-password"
                className="
                  w-full px-3 py-2.5 rounded-lg text-sm
                  bg-zinc-800 border border-zinc-700
                  text-zinc-100 placeholder:text-zinc-500
                  focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors
                "
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={isUnlocking || !password.trim()}
              className="
                w-full py-2.5 px-4 rounded-lg text-sm font-semibold
                bg-cyan-500 text-zinc-950
                hover:bg-cyan-400
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors
              "
            >
              {isUnlocking ? "Unlocking..." : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
