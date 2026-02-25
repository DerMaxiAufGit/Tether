import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { KeyDerivationProgress } from "@/components/auth/KeyDerivationProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { register } from "@/lib/crypto";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

const CRYPTO_STEPS = ["deriving", "generating", "encrypting", "done"];

// ============================================================
// Recovery key generation
// ============================================================

/**
 * Generates a recovery key: 20 random bytes encoded as base32
 * in groups of 4 chars separated by dashes (e.g. ABCD-EFGH-IJKL-MNOP-QRST)
 */
function generateRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  // Encode to base32 (5 bits per char)
  let result = "";
  let buffer = 0;
  let bitsLeft = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      bitsLeft -= 5;
      result += BASE32_CHARS[(buffer >> bitsLeft) & 31];
    }
  }
  if (bitsLeft > 0) {
    result += BASE32_CHARS[(buffer << (5 - bitsLeft)) & 31];
  }

  // Format in groups of 4 (pad to 32 chars = 8 groups)
  const padded = result.padEnd(32, "A");
  const groups: string[] = [];
  for (let i = 0; i < 32; i += 4) {
    groups.push(padded.slice(i, i + 4));
  }
  return groups.join("-");
}

async function hashRecoveryKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key.replace(/-/g, ""));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// Validation
// ============================================================

interface FormErrors {
  email?: string;
  displayName?: string;
  password?: string;
  confirmPassword?: string;
  form?: string;
}

function validateForm(fields: {
  email: string;
  displayName: string;
  password: string;
  confirmPassword: string;
}): FormErrors {
  const errors: FormErrors = {};

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!fields.email || !emailRe.test(fields.email)) {
    errors.email = "Please enter a valid email address";
  }

  if (!fields.displayName || fields.displayName.trim().length < 1) {
    errors.displayName = "Display name is required";
  } else if (fields.displayName.trim().length > 50) {
    errors.displayName = "Display name must be 50 characters or fewer";
  }

  if (!fields.password || fields.password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  }

  if (fields.password !== fields.confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }

  return errors;
}

// ============================================================
// Component
// ============================================================

interface RegisterResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationErrors = validateForm({
      email,
      displayName,
      password,
      confirmPassword,
    });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      // Step 1: Run crypto in Web Worker
      const cryptoResult = await register(password, (step) => {
        setCurrentStep(step);
      });

      // Step 2: Generate recovery key
      const recoveryKey = generateRecoveryKey();
      const recoveryKeyHash = await hashRecoveryKey(recoveryKey);

      // Step 3: POST to server
      const response = await api.post<RegisterResponse>("/api/auth/register", {
        email: email.toLowerCase().trim(),
        displayName: displayName.trim(),
        authKey: cryptoResult.authKey,
        salt: cryptoResult.salt,
        x25519PublicKey: cryptoResult.x25519PublicKey,
        ed25519PublicKey: cryptoResult.ed25519PublicKey,
        x25519EncryptedPrivateKey: cryptoResult.x25519EncryptedPrivateKey,
        x25519KeyIv: cryptoResult.x25519KeyIv,
        ed25519EncryptedPrivateKey: cryptoResult.ed25519EncryptedPrivateKey,
        ed25519KeyIv: cryptoResult.ed25519KeyIv,
        recoveryKeyHash,
      });

      // Step 4: Store auth state
      login(response.accessToken, response.user);

      // Step 5: Navigate to recovery key page with the key in router state
      navigate("/recovery-key", {
        state: { recoveryKey },
        replace: true,
      });
    } catch (err) {
      const error = err as Error & { status?: number };
      if (error.status === 409) {
        setErrors({ form: "This email is already registered. Try logging in." });
      } else {
        setErrors({
          form: error.message ?? "Registration failed. Please try again.",
        });
      }
      setCurrentStep(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      {/* Key derivation overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-sm">
            <KeyDerivationProgress
              step={currentStep}
              steps={CRYPTO_STEPS}
            />
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-white">Create your account</h2>
          <p className="text-zinc-400 text-sm">
            Already have an account?{" "}
            <a
              href="/login"
              className="text-cyan-400 hover:text-cyan-300 transition-colors"
              onClick={(e) => {
                e.preventDefault();
                navigate("/login");
              }}
            >
              Sign in
            </a>
          </p>
        </div>

        {/* Warning */}
        <div className="bg-amber-400/5 border border-amber-400/20 rounded-lg p-3">
          <p className="text-amber-300 text-xs leading-relaxed">
            <strong>Important:</strong> Your password encrypts your private keys.
            If you lose your password and recovery key, your data cannot be
            recovered.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-zinc-300">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-xs text-red-400">{errors.email}</p>
            )}
          </div>

          {/* Display name */}
          <div className="space-y-1.5">
            <Label htmlFor="displayName" className="text-zinc-300">
              Display name
            </Label>
            <Input
              id="displayName"
              type="text"
              placeholder="How others see you"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              autoComplete="nickname"
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
              aria-invalid={!!errors.displayName}
            />
            {errors.displayName && (
              <p className="text-xs text-red-400">{errors.displayName}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-zinc-300">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
              aria-invalid={!!errors.password}
            />
            <PasswordStrengthMeter password={password} />
            {errors.password && (
              <p className="text-xs text-red-400">{errors.password}</p>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-zinc-300">
              Confirm password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
              aria-invalid={!!errors.confirmPassword}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-red-400">{errors.confirmPassword}</p>
            )}
          </div>

          {/* Form-level error */}
          {errors.form && (
            <div className="bg-red-400/5 border border-red-400/20 rounded-lg p-3">
              <p className="text-red-400 text-sm">{errors.form}</p>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
