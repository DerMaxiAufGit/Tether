import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface RecoveryKeyLocationState {
  recoveryKey?: string;
}

export default function RecoveryKeyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as RecoveryKeyLocationState;
  const recoveryKey = state.recoveryKey;

  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  // If no recovery key in state, redirect to home
  if (!recoveryKey) {
    navigate("/", { replace: true });
    return null;
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(recoveryKey!);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement("textarea");
      el.value = recoveryKey!;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  }

  function handleContinue() {
    if (!acknowledged) return;
    // Clear the recovery key from navigation state before leaving
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                className="text-amber-400"
              >
                <path
                  d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 8v4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Save your recovery key</h1>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-md mx-auto">
            This is your <strong className="text-white">recovery key</strong>. If
            you forget your password, this key lets you regain access to your
            account. Save it somewhere safe — you will not see it again.
          </p>
        </div>

        {/* Recovery key display */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
              Recovery key
            </span>
            <span className="text-xs text-amber-400/70">One-time display only</span>
          </div>

          {/* Key text */}
          <div className="bg-zinc-950 rounded-lg p-4 select-all cursor-text">
            <p className="font-mono text-lg text-cyan-400 tracking-widest text-center leading-relaxed break-all">
              {recoveryKey}
            </p>
          </div>

          {/* Copy button */}
          <Button
            onClick={handleCopy}
            variant="outline"
            className={`w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all ${
              copied
                ? "border-emerald-500/50 text-emerald-400 bg-emerald-400/5"
                : ""
            }`}
          >
            {copied ? (
              <span className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M20 6L9 17L4 12"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Copied to clipboard!
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="9"
                    y="9"
                    width="13"
                    height="13"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
                Copy to clipboard
              </span>
            )}
          </Button>
        </div>

        {/* Storage suggestions */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 font-medium mb-2">
            Where to store your recovery key:
          </p>
          <ul className="space-y-1.5">
            {[
              "Password manager (1Password, Bitwarden, etc.)",
              "Printed and stored in a secure location",
              "Encrypted notes application",
            ].map((suggestion) => (
              <li key={suggestion} className="flex items-center gap-2 text-xs text-zinc-400">
                <div className="w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0" />
                {suggestion}
              </li>
            ))}
          </ul>
        </div>

        {/* Acknowledgment checkbox */}
        <div
          className="flex items-start gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl cursor-pointer select-none"
          onClick={() => setAcknowledged(!acknowledged)}
        >
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
              acknowledged
                ? "bg-cyan-500 border-cyan-500"
                : "border-zinc-600 bg-transparent"
            }`}
          >
            {acknowledged && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 6L9 17L4 12"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">
            I have saved my recovery key in a safe place. I understand that if I
            lose both my password and recovery key, my account cannot be
            recovered.
          </p>
        </div>

        {/* Continue button */}
        <Button
          onClick={handleContinue}
          disabled={!acknowledged}
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue to Tether
        </Button>
      </div>
    </div>
  );
}
