interface KeyDerivationProgressProps {
  step: string | null;
  steps: string[];
}

const STEP_LABELS: Record<string, string> = {
  deriving: "Deriving keys from password...",
  generating: "Generating cryptographic keypairs...",
  encrypting: "Encrypting private keys...",
  decrypting: "Decrypting private keys...",
  "re-encrypting": "Re-encrypting with new keys...",
  done: "Done!",
};

function getDisplayLabel(step: string): string {
  return STEP_LABELS[step] ?? step;
}

export function KeyDerivationProgress({
  step,
  steps,
}: KeyDerivationProgressProps) {
  const currentIndex = step ? steps.indexOf(step) : -1;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center flex-shrink-0">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="text-cyan-400"
          >
            <path
              d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-white">Generating your keys</p>
          <p className="text-xs text-zinc-400">
            All cryptography runs locally in your browser
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((s, index) => {
          const isCompleted = currentIndex > index || s === "done" && step === "done";
          const isCurrent = s === step && s !== "done";
          const isPending = currentIndex < index && s !== step;
          const isDone = s === "done" && step === "done";

          return (
            <div
              key={s}
              className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all duration-300 ${
                isCurrent
                  ? "bg-cyan-400/5 border border-cyan-400/20"
                  : isDone
                  ? "bg-emerald-400/5 border border-emerald-400/20"
                  : isCompleted
                  ? "opacity-60"
                  : isPending
                  ? "opacity-30"
                  : "opacity-30"
              }`}
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {isDone ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-emerald-400"
                  >
                    <path
                      d="M20 6L9 17L4 12"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : isCompleted ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-cyan-400"
                  >
                    <path
                      d="M20 6L9 17L4 12"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : isCurrent ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-cyan-400 animate-spin"
                    style={{ animationDuration: "1s" }}
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
                ) : (
                  <div className="w-3 h-3 rounded-full border border-zinc-600" />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-sm ${
                  isDone
                    ? "text-emerald-400 font-medium"
                    : isCurrent
                    ? "text-white font-medium"
                    : isCompleted
                    ? "text-zinc-300"
                    : "text-zinc-600"
                }`}
              >
                {getDisplayLabel(s)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-zinc-500 text-center pt-2">
        Your private keys never leave this device
      </p>
    </div>
  );
}
