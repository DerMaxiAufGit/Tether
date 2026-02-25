import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex bg-zinc-950">
      {/* Left panel: branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-zinc-900 p-12 relative overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 25% 25%, #06b6d4 0%, transparent 50%), radial-gradient(circle at 75% 75%, #0891b2 0%, transparent 50%)",
            }}
          />
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <img
            src="/assets/tether-logo.svg"
            alt="Tether"
            className="h-12 w-auto"
          />
        </div>

        {/* Value proposition */}
        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Encrypted.
            <br />
            <span className="text-cyan-400">Self-hosted.</span>
            <br />
            Yours.
          </h1>
          <p className="text-zinc-400 text-lg leading-relaxed max-w-sm">
            Your conversations stay private. Your keys never leave your device.
            Your data belongs to you.
          </p>

          {/* Feature bullets */}
          <div className="space-y-3">
            {[
              "End-to-end encrypted by default",
              "Keys generated locally in your browser",
              "Zero knowledge — even we can't read your messages",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center flex-shrink-0">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="text-cyan-400"
                  >
                    <path
                      d="M2 6L5 9L10 3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <span className="text-zinc-300 text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom trust signal */}
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-zinc-500 text-xs">
            <img src="/assets/tether-icon.svg" alt="" className="w-4 h-4 opacity-60" />
            <span>256-bit AES-GCM encryption &bull; PBKDF2-600k &bull; X25519 + Ed25519</span>
          </div>
        </div>
      </div>

      {/* Right panel: form content */}
      <div className="flex-1 flex flex-col bg-zinc-900/50 lg:bg-zinc-900/30">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-2 p-6 border-b border-zinc-800">
          <img
            src="/assets/tether-icon.svg"
            alt="Tether"
            className="w-7 h-7"
          />
          <span className="text-lg font-bold text-cyan-400">Tether</span>
        </div>

        {/* Form content */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
