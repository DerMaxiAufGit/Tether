import { useMemo } from "react";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";

// Initialize zxcvbn with English dictionary
zxcvbnOptions.setOptions({
  translations: zxcvbnEnPackage.translations,
  graphs: zxcvbnEnPackage.adjacencyGraphs,
  dictionary: {
    ...zxcvbnEnPackage.dictionary,
  },
});

interface PasswordStrengthMeterProps {
  password: string;
}

const STRENGTH_CONFIG = [
  { label: "Very Weak", color: "bg-red-500", textColor: "text-red-400" },
  { label: "Weak", color: "bg-red-400", textColor: "text-red-400" },
  { label: "Fair", color: "bg-yellow-400", textColor: "text-yellow-400" },
  { label: "Strong", color: "bg-green-400", textColor: "text-green-400" },
  { label: "Very Strong", color: "bg-emerald-400", textColor: "text-emerald-400" },
];

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const result = useMemo(() => {
    if (!password) return null;
    return zxcvbn(password);
  }, [password]);

  if (!password) {
    return (
      <p className="text-xs text-zinc-500 mt-1">Minimum 8 characters required</p>
    );
  }

  const score = result?.score ?? 0;
  const config = STRENGTH_CONFIG[score];
  const filledSegments = score + 1;

  return (
    <div className="mt-2 space-y-1.5">
      {/* Segmented bar */}
      <div className="flex gap-1">
        {STRENGTH_CONFIG.map((seg, i) => (
          <div
            key={seg.label}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              i < filledSegments ? config.color : "bg-zinc-700"
            }`}
          />
        ))}
      </div>

      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${config.textColor}`}>
          {config.label}
        </span>
        <span className="text-xs text-zinc-500">Min. 8 characters</span>
      </div>

      {/* Feedback hint */}
      {result?.feedback.warning && (
        <p className="text-xs text-zinc-400">{result.feedback.warning}</p>
      )}
    </div>
  );
}
