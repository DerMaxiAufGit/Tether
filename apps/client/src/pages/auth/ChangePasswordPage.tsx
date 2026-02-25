import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { KeyDerivationProgress } from "@/components/auth/KeyDerivationProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/lib/crypto";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

const CRYPTO_STEPS = ["deriving", "decrypting", "re-encrypting", "done"];

interface KeyBundle {
  salt: string;
  x25519EncryptedPrivateKey: string;
  x25519KeyIv: string;
  ed25519EncryptedPrivateKey: string;
  ed25519KeyIv: string;
}

interface FormErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmNewPassword?: string;
  form?: string;
}

function validate(fields: {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}): FormErrors {
  const errors: FormErrors = {};

  if (!fields.currentPassword) {
    errors.currentPassword = "Current password is required";
  }

  if (!fields.newPassword || fields.newPassword.length < 8) {
    errors.newPassword = "New password must be at least 8 characters";
  }

  if (fields.currentPassword === fields.newPassword) {
    errors.newPassword = "New password must be different from current password";
  }

  if (fields.newPassword !== fields.confirmNewPassword) {
    errors.confirmNewPassword = "Passwords do not match";
  }

  return errors;
}

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationErrors = validate({ currentPassword, newPassword, confirmNewPassword });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      // Step 1: Fetch current key bundle from server
      const keyBundle = await api.get<KeyBundle>("/api/auth/me/keys");

      // Step 2: Re-derive and re-encrypt in Worker
      const cryptoResult = await changePassword(
        currentPassword,
        newPassword,
        {
          salt: keyBundle.salt,
          x25519Blob: keyBundle.x25519EncryptedPrivateKey,
          x25519Iv: keyBundle.x25519KeyIv,
          ed25519Blob: keyBundle.ed25519EncryptedPrivateKey,
          ed25519Iv: keyBundle.ed25519KeyIv,
        },
        (step) => setCurrentStep(step),
      );

      // Step 3: POST new key material to server
      await api.post("/api/auth/change-password", {
        oldAuthKey: cryptoResult.oldAuthKey,
        newAuthKey: cryptoResult.newAuthKey,
        newSalt: cryptoResult.newSalt,
        x25519EncryptedPrivateKey: cryptoResult.x25519EncryptedPrivateKey,
        x25519KeyIv: cryptoResult.x25519KeyIv,
        ed25519EncryptedPrivateKey: cryptoResult.ed25519EncryptedPrivateKey,
        ed25519KeyIv: cryptoResult.ed25519KeyIv,
      });

      // Step 4: Clear auth state and redirect to login
      await logout();
      navigate("/login", {
        replace: true,
        state: { message: "Password changed successfully. Please sign in with your new password." },
      });
    } catch (err) {
      const error = err as Error & { status?: number };
      if (
        error.status === 401 ||
        error.message?.includes("Invalid credentials") ||
        error.message?.includes("Decryption failed")
      ) {
        setErrors({ form: "Current password is incorrect" });
      } else {
        setErrors({ form: error.message ?? "Password change failed. Please try again." });
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
            <KeyDerivationProgress step={currentStep} steps={CRYPTO_STEPS} />
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-white">Change password</h2>
          <p className="text-zinc-400 text-sm">
            Your private keys will be re-encrypted with your new password.
            You'll be signed out on all devices.
          </p>
        </div>

        {/* Warning */}
        <div className="bg-amber-400/5 border border-amber-400/20 rounded-lg p-3">
          <p className="text-amber-300 text-xs leading-relaxed">
            <strong>Note:</strong> This will sign you out of all devices. Make
            sure you remember your new password — it encrypts your private keys.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword" className="text-zinc-300">
              Current password
            </Label>
            <Input
              id="currentPassword"
              type="password"
              placeholder="Your current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
              aria-invalid={!!errors.currentPassword}
            />
            {errors.currentPassword && (
              <p className="text-xs text-red-400">{errors.currentPassword}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="newPassword" className="text-zinc-300">
              New password
            </Label>
            <Input
              id="newPassword"
              type="password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
              aria-invalid={!!errors.newPassword}
            />
            <PasswordStrengthMeter password={newPassword} />
            {errors.newPassword && (
              <p className="text-xs text-red-400">{errors.newPassword}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmNewPassword" className="text-zinc-300">
              Confirm new password
            </Label>
            <Input
              id="confirmNewPassword"
              type="password"
              placeholder="Repeat your new password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              autoComplete="new-password"
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
              aria-invalid={!!errors.confirmNewPassword}
            />
            {errors.confirmNewPassword && (
              <p className="text-xs text-red-400">{errors.confirmNewPassword}</p>
            )}
          </div>

          {errors.form && (
            <div className="bg-red-400/5 border border-red-400/20 rounded-lg p-3">
              <p className="text-red-400 text-sm">{errors.form}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
              className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Changing..." : "Change password"}
            </Button>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
