import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { KeyDerivationProgress } from "@/components/auth/KeyDerivationProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginDecrypt } from "@/lib/crypto";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

// ============================================================
// Two-step login flow:
//
//   1. POST /api/auth/challenge { email } -> { salt }
//      (always returns a salt; fake salt for non-existent emails)
//
//   2. Derive authKey from password + salt (Web Crypto, main thread)
//      Uses same KDF pipeline as the worker so we can send authKey to server.
//
//   3. POST /api/auth/login { email, authKey } -> { accessToken, user, keyBundle }
//
//   4. Decrypt private keys from keyBundle using loginDecrypt (Worker)
//      This verifies the password (AES-GCM tag mismatch = wrong password).
// ============================================================

const CRYPTO_STEPS = ["deriving", "decrypting", "done"];

interface FormErrors {
  email?: string;
  password?: string;
  form?: string;
}

interface ChallengeResponse {
  salt: string;
}

interface LoginResponse {
  accessToken: string;
  user: { id: string; email: string; displayName: string };
  keyBundle: {
    salt: string;
    x25519EncryptedPrivateKey: string;
    x25519KeyIv: string;
    ed25519EncryptedPrivateKey: string;
    ed25519KeyIv: string;
  };
}

// ============================================================
// Auth key derivation (matches crypto.worker.ts pipeline)
// ============================================================

const KDF_ITERATIONS = 600000;
const AUTH_HKDF_INFO = "tether-auth-key-v1";

/**
 * Derives only the authKey from password + salt (base64).
 * Needed to call POST /login before we have the keyBundle blobs.
 * Runs on the main thread — acceptable since it's just one PBKDF2 pass.
 */
async function deriveAuthKey(password: string, saltBase64: string): Promise<string> {
  const enc = new TextEncoder();

  const saltBin = atob(saltBase64);
  const salt = new Uint8Array(saltBin.length);
  for (let i = 0; i < saltBin.length; i++) salt[i] = saltBin.charCodeAt(i);

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const rawBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
    passwordKey,
    512,
  );

  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    rawBits,
    "HKDF",
    false,
    ["deriveBits"],
  );

  const authKeyBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: enc.encode(AUTH_HKDF_INFO),
    },
    hkdfKey,
    256,
  );

  const bytes = new Uint8Array(authKeyBits);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ============================================================
// Component
// ============================================================

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);

  function validate(): FormErrors {
    const errs: FormErrors = {};
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRe.test(email)) errs.email = "Please enter a valid email address";
    if (!password) errs.password = "Password is required";
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    setCurrentStep("deriving");

    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Step 1: Get salt from challenge endpoint
      const challenge = await api.post<ChallengeResponse>("/api/auth/challenge", {
        email: normalizedEmail,
      });

      // Step 2: Derive authKey from password + salt (main thread)
      const authKey = await deriveAuthKey(password, challenge.salt);

      // Step 3: POST login with authKey
      const loginResponse = await api.post<LoginResponse>("/api/auth/login", {
        email: normalizedEmail,
        authKey,
      });

      // Step 4: Decrypt private keys in Worker (verifies correct password)
      setCurrentStep("decrypting");
      await loginDecrypt(
        password,
        {
          salt: loginResponse.keyBundle.salt,
          x25519Blob: loginResponse.keyBundle.x25519EncryptedPrivateKey,
          x25519Iv: loginResponse.keyBundle.x25519KeyIv,
          ed25519Blob: loginResponse.keyBundle.ed25519EncryptedPrivateKey,
          ed25519Iv: loginResponse.keyBundle.ed25519KeyIv,
        },
        (step) => setCurrentStep(step),
      );

      // Step 5: Store auth state and navigate
      login(loginResponse.accessToken, loginResponse.user);
      navigate("/", { replace: true });
    } catch (err) {
      const error = err as Error & { status?: number };
      const isCredentialError =
        error.status === 401 ||
        error.message?.includes("Invalid credentials") ||
        error.message?.includes("Decryption failed");

      setErrors({
        form: isCredentialError
          ? "Invalid email or password"
          : (error.message ?? "Login failed. Please try again."),
      });
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
            <KeyDerivationProgress step={currentStep} steps={CRYPTO_STEPS} />
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-white">Welcome back</h2>
          <p className="text-zinc-400 text-sm">
            Don't have an account?{" "}
            <a
              href="/register"
              className="text-cyan-400 hover:text-cyan-300 transition-colors"
              onClick={(e) => { e.preventDefault(); navigate("/register"); }}
            >
              Create one
            </a>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-zinc-300">Email</Label>
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
            {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-zinc-300">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
              aria-invalid={!!errors.password}
            />
            {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
          </div>

          {errors.form && (
            <div className="bg-red-400/5 border border-red-400/20 rounded-lg p-3">
              <p className="text-red-400 text-sm">{errors.form}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="text-xs text-zinc-500 text-center">
          Your keys are derived locally. We never see your password.
        </p>
      </div>
    </AuthLayout>
  );
}
