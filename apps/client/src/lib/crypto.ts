/**
 * crypto.ts — Typed Promise-based interface to the crypto Web Worker
 *
 * Wraps the crypto worker with a clean async API.
 * All cryptographic operations run off the main thread to prevent UI freezes
 * during PBKDF2 key derivation (600k iterations ≈ 1-3s).
 *
 * Usage:
 *   import { register, loginDecrypt, changePassword } from "@/lib/crypto";
 *
 *   const result = await register("my-password", (step) => setProgressLabel(step));
 */

import type {
  CryptoWorkerResponse,
  RegisterResultData,
  LoginDecryptResultData,
  ChangePasswordResultData,
  EncryptMessageResultData,
  DecryptMessageResultData,
} from "@tether/shared";

export type { EncryptMessageResultData, DecryptMessageResultData };

// ============================================================
// Worker instantiation (Vite module worker pattern)
// ============================================================

const worker = new Worker(
  new URL("../workers/crypto.worker.ts", import.meta.url),
  { type: "module" },
);

// ============================================================
// Request/response correlation
// ============================================================

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  onProgress?: (step: string) => void;
}

const pending = new Map<string, PendingRequest>();

worker.onmessage = (event: MessageEvent<CryptoWorkerResponse>) => {
  const message = event.data;
  const { id } = message;

  const entry = pending.get(id);
  if (!entry) return; // stale or unknown response

  if (message.type === "PROGRESS") {
    entry.onProgress?.(message.step);
    return; // keep the entry — RESULT will come next
  }

  // RESULT or ERROR — both resolve/reject and clean up
  pending.delete(id);

  if (message.type === "RESULT") {
    entry.resolve(message.data);
  } else {
    entry.reject(new Error(message.error));
  }
};

worker.onerror = (event: ErrorEvent) => {
  // Propagate unhandled worker errors to all pending requests
  const error = new Error(
    `Crypto worker unhandled error: ${event.message}`,
  );
  for (const [id, entry] of pending) {
    pending.delete(id);
    entry.reject(error);
  }
};

/**
 * Posts a message to the worker and returns a Promise that resolves
 * when the worker sends back a RESULT (or rejects on ERROR).
 * Progress messages are forwarded to `onProgress` before resolution.
 */
function call<T>(
  type: string,
  payload: Record<string, unknown>,
  onProgress?: (step: string) => void,
): Promise<T> {
  const id = crypto.randomUUID();

  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      onProgress,
    });
    worker.postMessage({ id, type, payload });
  });
}

// ============================================================
// Exported result types
// ============================================================

export interface RegisterResult {
  authKey: string; // base64
  salt: string; // base64
  x25519PublicKey: string; // base64
  ed25519PublicKey: string; // base64
  x25519EncryptedPrivateKey: string; // base64
  x25519KeyIv: string; // base64
  ed25519EncryptedPrivateKey: string; // base64
  ed25519KeyIv: string; // base64
}

export interface LoginDecryptResult {
  authKey: string; // base64
}

export interface ChangePasswordResult {
  oldAuthKey: string; // base64 — for server verification
  newAuthKey: string; // base64
  newSalt: string; // base64
  x25519EncryptedPrivateKey: string; // base64
  x25519KeyIv: string; // base64
  ed25519EncryptedPrivateKey: string; // base64
  ed25519KeyIv: string; // base64
}

// Type aliases to ensure local types match the shared worker result types
// (TypeScript will error if the shapes diverge)
type _AssertRegisterMatch = RegisterResult extends RegisterResultData
  ? RegisterResultData extends RegisterResult
    ? true
    : never
  : never;
type _AssertLoginMatch = LoginDecryptResult extends LoginDecryptResultData
  ? LoginDecryptResultData extends LoginDecryptResult
    ? true
    : never
  : never;
type _AssertChangeMatch = ChangePasswordResult extends ChangePasswordResultData
  ? ChangePasswordResultData extends ChangePasswordResult
    ? true
    : never
  : never;
// These type assertions will cause a compile error if types diverge
const _: [_AssertRegisterMatch, _AssertLoginMatch, _AssertChangeMatch] = [
  true,
  true,
  true,
];
void _;

// ============================================================
// Public API
// ============================================================

/**
 * Runs the full registration crypto flow:
 *   1. Generate random salt
 *   2. PBKDF2 → HKDF → authKey + encryptionKey
 *   3. Generate X25519 + Ed25519 keypairs
 *   4. AES-256-GCM wrap private keys
 *
 * Returns everything the server needs to store for future logins.
 *
 * @param password   User's plaintext password
 * @param onProgress Called with each progress step label ("deriving", "generating", etc.)
 */
export function register(
  password: string,
  onProgress?: (step: string) => void,
): Promise<RegisterResult> {
  return call<RegisterResult>("REGISTER", { password }, onProgress);
}

/**
 * Runs the login crypto flow:
 *   1. PBKDF2 → HKDF → authKey + encryptionKey (using stored salt)
 *   2. AES-256-GCM decrypt private keys (proves correct password via tag validation)
 *
 * Throws if the password is wrong (AES-GCM tag mismatch).
 *
 * @param password   User's plaintext password
 * @param keyBundle  Encrypted key blobs and KDF salt from the server
 * @param onProgress Called with each progress step label
 */
export function loginDecrypt(
  password: string,
  keyBundle: {
    salt: string;
    x25519Blob: string;
    x25519Iv: string;
    ed25519Blob: string;
    ed25519Iv: string;
  },
  onProgress?: (step: string) => void,
): Promise<LoginDecryptResult> {
  return call<LoginDecryptResult>(
    "LOGIN_DECRYPT",
    {
      password,
      salt: keyBundle.salt,
      x25519Blob: keyBundle.x25519Blob,
      x25519Iv: keyBundle.x25519Iv,
      ed25519Blob: keyBundle.ed25519Blob,
      ed25519Iv: keyBundle.ed25519Iv,
    },
    onProgress,
  );
}

/**
 * Runs the password change crypto flow:
 *   1. Derive keys from current password (to decrypt existing blobs)
 *   2. Decrypt private keys with current encryption key
 *   3. Generate new salt, derive new keys from new password
 *   4. Re-encrypt private keys with new encryption key + fresh IVs
 *
 * Returns old and new auth keys so the server can verify the current
 * password before accepting the change.
 *
 * Throws if the current password is wrong.
 *
 * @param currentPassword  Current plaintext password
 * @param newPassword      New plaintext password
 * @param currentKeyData   Existing encrypted key blobs and KDF salt
 * @param onProgress       Called with each progress step label
 */
export function changePassword(
  currentPassword: string,
  newPassword: string,
  currentKeyData: {
    salt: string;
    x25519Blob: string;
    x25519Iv: string;
    ed25519Blob: string;
    ed25519Iv: string;
  },
  onProgress?: (step: string) => void,
): Promise<ChangePasswordResult> {
  return call<ChangePasswordResult>(
    "CHANGE_PASSWORD",
    {
      currentPassword,
      newPassword,
      currentSalt: currentKeyData.salt,
      x25519Blob: currentKeyData.x25519Blob,
      x25519Iv: currentKeyData.x25519Iv,
      ed25519Blob: currentKeyData.ed25519Blob,
      ed25519Iv: currentKeyData.ed25519Iv,
    },
    onProgress,
  );
}

/**
 * Encrypts a plaintext message for multiple recipients using ephemeral X25519 ECDH.
 * For each recipient, a fresh ephemeral key pair is generated and the message key
 * is wrapped using HKDF-derived AES-256-GCM.
 *
 * The sender should include themselves in the recipients list using their own
 * x25519PublicKey so they can decrypt their own messages later.
 *
 * Requires keys to have been unlocked via loginDecrypt() first.
 *
 * @param plaintext   The plaintext message to encrypt
 * @param recipients  Array of {userId, x25519PublicKey} for each intended recipient
 */
export function encryptMessage(
  plaintext: string,
  recipients: Array<{ userId: string; x25519PublicKey: string }>,
): Promise<EncryptMessageResultData> {
  return call<EncryptMessageResultData>("ENCRYPT_MESSAGE", { plaintext, recipients });
}

/**
 * Decrypts an encrypted message using the cached private key.
 * Reverses the ECDH + HKDF + AES-256-GCM wrap to recover the plaintext.
 *
 * Requires keys to have been unlocked via loginDecrypt() first.
 *
 * @param payload  The encrypted message envelope data (content + recipient key info)
 */
export function decryptMessage(payload: {
  encryptedContent: string;
  contentIv: string;
  encryptedMessageKey: string;
  ephemeralPublicKey: string;
}): Promise<DecryptMessageResultData> {
  return call<DecryptMessageResultData>("DECRYPT_MESSAGE", payload);
}

/**
 * Terminates the crypto worker.
 * Call this on logout to free resources and prevent key material
 * from persisting in worker memory.
 */
export function terminateWorker(): void {
  worker.terminate();
}
