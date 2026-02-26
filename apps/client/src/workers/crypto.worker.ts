/**
 * crypto.worker.ts — Zero-knowledge cryptographic operations
 *
 * Runs in a dedicated Web Worker to avoid blocking the main thread
 * during PBKDF2 key derivation (600k iterations ≈ 1-3s on modern hardware).
 *
 * Uses ONLY the Web Crypto API — zero npm crypto dependencies.
 *
 * Key architecture:
 *   password + salt ──PBKDF2──► 512-bit key material
 *                                    │
 *                 HKDF(info="tether-auth-key-v1")     HKDF(info="tether-encryption-key-v1")
 *                              │                              │
 *                        authKey (sent to server)   encryptionKey (stays in browser)
 *                                                            │
 *                                              AES-256-GCM wraps X25519 + Ed25519 private keys
 */

import {
  KDF_ITERATIONS,
  AUTH_HKDF_INFO,
  ENCRYPTION_HKDF_INFO,
  MESSAGE_KEY_WRAP_INFO,
} from "@tether/shared";
import type {
  CryptoWorkerRequest,
  RegisterResultData,
  LoginDecryptResultData,
  ChangePasswordResultData,
  EncryptMessageResultData,
  DecryptMessageResultData,
} from "@tether/shared";

// ============================================================
// Conversion helpers
// ============================================================

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return uint8ToBase64(new Uint8Array(buffer));
}

// ============================================================
// Key derivation
// ============================================================

/**
 * Derives two keys from a password + salt:
 *   - authKey:       256-bit raw bytes to send to the server
 *   - encryptionKey: AES-256-GCM CryptoKey (NOT extractable) for local use only
 *
 * Uses PBKDF2 once (expensive, brute-force resistant), then HKDF (cheap)
 * to split into two distinct keys via different `info` strings.
 */
async function deriveKeysFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<{ authKey: Uint8Array; encryptionKey: CryptoKey }> {
  const enc = new TextEncoder();

  // Step 1: Import password as PBKDF2 key material
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  // Step 2: PBKDF2 → 512 bits of key material
  // OWASP 2025: 600,000 iterations for PBKDF2-HMAC-SHA256
  const rawBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
    passwordKey,
    512,
  );

  // Step 3: Import raw bits as HKDF key material
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    rawBits,
    "HKDF",
    false,
    ["deriveBits", "deriveKey"],
  );

  // Zero salt for HKDF — the PBKDF2 salt already provides entropy
  const hkdfSalt = new Uint8Array(32);

  // Step 4a: Derive auth key (256 bits) — sent to server during login/register
  const authKeyBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: hkdfSalt,
      info: enc.encode(AUTH_HKDF_INFO),
    },
    hkdfKey,
    256,
  );

  // Step 4b: Derive encryption key (AES-256-GCM) — stays in browser only
  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: hkdfSalt,
      info: enc.encode(ENCRYPTION_HKDF_INFO),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false, // NOT extractable — never leaves browser memory
    ["encrypt", "decrypt"],
  );

  return {
    authKey: new Uint8Array(authKeyBits),
    encryptionKey,
  };
}

// ============================================================
// Keypair generation and wrapping
// ============================================================

interface WrappedKeypairs {
  x25519Public: ArrayBuffer;
  x25519EncryptedPrivate: { ciphertext: ArrayBuffer; iv: Uint8Array };
  ed25519Public: ArrayBuffer;
  ed25519EncryptedPrivate: { ciphertext: ArrayBuffer; iv: Uint8Array };
}

/**
 * Generates X25519 (key agreement) and Ed25519 (signing) keypairs.
 * Public keys are exported as raw bytes.
 * Private keys are encrypted with AES-256-GCM using the encryptionKey.
 * Each private key gets a fresh random 96-bit IV.
 */
async function generateAndWrapKeypairs(
  encryptionKey: CryptoKey,
): Promise<WrappedKeypairs> {
  // Generate X25519 keypair (Diffie-Hellman key agreement for E2EE)
  const x25519 = await crypto.subtle.generateKey(
    { name: "X25519" },
    true, // extractable so we can export and encrypt
    ["deriveKey", "deriveBits"],
  );

  // Generate Ed25519 keypair (digital signatures for message authentication)
  const ed25519 = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  );

  // Helper: export private key as PKCS8 then AES-256-GCM encrypt it
  async function wrapPrivateKey(
    privateKey: CryptoKey,
  ): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
    const exported = await crypto.subtle.exportKey("pkcs8", privateKey);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit random nonce
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      encryptionKey,
      exported,
    );
    return { ciphertext, iv };
  }

  // Export public keys
  // X25519 public key: raw format (32 bytes)
  const x25519Public = await crypto.subtle.exportKey("raw", x25519.publicKey);

  // Ed25519 public key: spki format (standard SubjectPublicKeyInfo DER encoding)
  // Note: Ed25519 raw export gives 32 bytes but "raw" is not universally supported
  // for Ed25519 in all browsers. Using "spki" is more portable and standard.
  const ed25519Public = await crypto.subtle.exportKey(
    "spki",
    ed25519.publicKey,
  );

  return {
    x25519Public,
    x25519EncryptedPrivate: await wrapPrivateKey(x25519.privateKey),
    ed25519Public,
    ed25519EncryptedPrivate: await wrapPrivateKey(ed25519.privateKey),
  };
}

// ============================================================
// Private key unwrapping (decryption)
// ============================================================

interface UnwrappedKeys {
  x25519PrivateKey: CryptoKey;
  ed25519PrivateKey: CryptoKey;
}

/**
 * Decrypts and imports private keys.
 * AES-GCM decrypt will throw on wrong password (tag mismatch = DOMException).
 * Returns CryptoKey objects kept in worker memory for future Phase 3 use.
 */
async function unwrapPrivateKeys(
  encryptionKey: CryptoKey,
  x25519Blob: Uint8Array,
  x25519Iv: Uint8Array,
  ed25519Blob: Uint8Array,
  ed25519Iv: Uint8Array,
): Promise<UnwrappedKeys> {
  // Decrypt X25519 private key
  const x25519Pkcs8 = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: x25519Iv },
    encryptionKey,
    x25519Blob,
  );

  // Decrypt Ed25519 private key
  const ed25519Pkcs8 = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ed25519Iv },
    encryptionKey,
    ed25519Blob,
  );

  // Import X25519 private key from PKCS8
  const x25519PrivateKey = await crypto.subtle.importKey(
    "pkcs8",
    x25519Pkcs8,
    { name: "X25519" },
    false,
    ["deriveKey", "deriveBits"],
  );

  // Import Ed25519 private key from PKCS8
  const ed25519PrivateKey = await crypto.subtle.importKey(
    "pkcs8",
    ed25519Pkcs8,
    { name: "Ed25519" },
    false,
    ["sign"],
  );

  return { x25519PrivateKey, ed25519PrivateKey };
}

// ============================================================
// Main message handler
// ============================================================

// In-memory store for unwrapped private keys — used by ENCRYPT_MESSAGE and DECRYPT_MESSAGE
let _cachedKeys: UnwrappedKeys | null = null;

self.onmessage = async (event: MessageEvent<CryptoWorkerRequest>) => {
  const { id, type, payload } = event.data;

  // Helper to post a progress update back to the main thread
  function postProgress(step: string): void {
    self.postMessage({ type: "PROGRESS", id, step });
  }

  // Helper to post the final result
  function postResult(data: unknown): void {
    self.postMessage({ type: "RESULT", id, success: true, data });
  }

  // Helper to post an error
  function postError(error: string): void {
    self.postMessage({ type: "ERROR", id, success: false, error });
  }

  try {
    switch (type) {
      // ----------------------------------------------------------
      // REGISTER: Full registration flow
      // derive keys → generate keypairs → encrypt private keys
      // ----------------------------------------------------------
      case "REGISTER": {
        const { password } = payload;

        postProgress("deriving");

        // Generate fresh 32-byte random salt (stored server-side, returned on login)
        const salt = crypto.getRandomValues(new Uint8Array(32));
        const { authKey, encryptionKey } = await deriveKeysFromPassword(
          password,
          salt,
        );

        postProgress("generating");

        const keypairs = await generateAndWrapKeypairs(encryptionKey);

        postProgress("encrypting");
        // (encryption already happened inside generateAndWrapKeypairs;
        //  this step label is for UX continuity)

        postProgress("done");

        const result: RegisterResultData = {
          authKey: uint8ToBase64(authKey),
          salt: uint8ToBase64(salt),
          x25519PublicKey: arrayBufferToBase64(keypairs.x25519Public),
          ed25519PublicKey: arrayBufferToBase64(keypairs.ed25519Public),
          x25519EncryptedPrivateKey: arrayBufferToBase64(
            keypairs.x25519EncryptedPrivate.ciphertext,
          ),
          x25519KeyIv: uint8ToBase64(keypairs.x25519EncryptedPrivate.iv),
          ed25519EncryptedPrivateKey: arrayBufferToBase64(
            keypairs.ed25519EncryptedPrivate.ciphertext,
          ),
          ed25519KeyIv: uint8ToBase64(keypairs.ed25519EncryptedPrivate.iv),
        };

        postResult(result);
        break;
      }

      // ----------------------------------------------------------
      // LOGIN_DECRYPT: Re-derive keys and decrypt private keys
      // Proves the password is correct (AES-GCM tag validates)
      // ----------------------------------------------------------
      case "LOGIN_DECRYPT": {
        const { password, salt, x25519Blob, x25519Iv, ed25519Blob, ed25519Iv } =
          payload;

        postProgress("deriving");

        const { authKey, encryptionKey } = await deriveKeysFromPassword(
          password,
          base64ToUint8(salt),
        );

        postProgress("decrypting");

        try {
          // AES-GCM decrypt will throw DOMException if password is wrong
          const unwrapped = await unwrapPrivateKeys(
            encryptionKey,
            base64ToUint8(x25519Blob),
            base64ToUint8(x25519Iv),
            base64ToUint8(ed25519Blob),
            base64ToUint8(ed25519Iv),
          );

          // Cache for Phase 3 use
          _cachedKeys = unwrapped;
        } catch {
          // AES-GCM tag mismatch = wrong password
          postError("Decryption failed — incorrect password");
          return;
        }

        postProgress("done");

        const result: LoginDecryptResultData = {
          authKey: uint8ToBase64(authKey),
        };

        postResult(result);
        break;
      }

      // ----------------------------------------------------------
      // CHANGE_PASSWORD: Re-derive with new password, re-encrypt
      // Returns both old and new auth keys for server verification
      // ----------------------------------------------------------
      case "CHANGE_PASSWORD": {
        const {
          currentPassword,
          newPassword,
          currentSalt,
          x25519Blob,
          x25519Iv,
          ed25519Blob,
          ed25519Iv,
        } = payload;

        postProgress("deriving");

        // Derive from current password to decrypt existing blobs
        const { authKey: oldAuthKey, encryptionKey: currentEncryptionKey } =
          await deriveKeysFromPassword(
            currentPassword,
            base64ToUint8(currentSalt),
          );

        postProgress("decrypting");

        // Decrypt existing private key blobs with current encryption key
        let x25519Pkcs8: ArrayBuffer;
        let ed25519Pkcs8: ArrayBuffer;

        try {
          x25519Pkcs8 = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: base64ToUint8(x25519Iv) },
            currentEncryptionKey,
            base64ToUint8(x25519Blob),
          );

          ed25519Pkcs8 = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: base64ToUint8(ed25519Iv) },
            currentEncryptionKey,
            base64ToUint8(ed25519Blob),
          );
        } catch {
          postError("Decryption failed — incorrect current password");
          return;
        }

        postProgress("re-encrypting");

        // Generate new salt and derive keys from new password
        const newSalt = crypto.getRandomValues(new Uint8Array(32));
        const { authKey: newAuthKey, encryptionKey: newEncryptionKey } =
          await deriveKeysFromPassword(newPassword, newSalt);

        // Re-encrypt private keys with new encryption key + fresh IVs
        const newX25519Iv = crypto.getRandomValues(new Uint8Array(12));
        const newEd25519Iv = crypto.getRandomValues(new Uint8Array(12));

        const newX25519Ciphertext = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: newX25519Iv },
          newEncryptionKey,
          x25519Pkcs8,
        );

        const newEd25519Ciphertext = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: newEd25519Iv },
          newEncryptionKey,
          ed25519Pkcs8,
        );

        postProgress("done");

        const result: ChangePasswordResultData = {
          oldAuthKey: uint8ToBase64(oldAuthKey),
          newAuthKey: uint8ToBase64(newAuthKey),
          newSalt: uint8ToBase64(newSalt),
          x25519EncryptedPrivateKey: arrayBufferToBase64(newX25519Ciphertext),
          x25519KeyIv: uint8ToBase64(newX25519Iv),
          ed25519EncryptedPrivateKey: arrayBufferToBase64(newEd25519Ciphertext),
          ed25519KeyIv: uint8ToBase64(newEd25519Iv),
        };

        postResult(result);
        break;
      }

      // ----------------------------------------------------------
      // ENCRYPT_MESSAGE: Encrypt plaintext for multiple recipients
      // Uses ephemeral X25519 ECDH + HKDF + AES-256-GCM wrap per recipient
      // ----------------------------------------------------------
      case "ENCRYPT_MESSAGE": {
        if (!_cachedKeys) throw new Error("Keys not unlocked — call LOGIN_DECRYPT first");

        const { plaintext, recipients } = payload;

        // 1. Generate fresh AES-256-GCM message key (extractable for wrapping)
        const messageKey = await crypto.subtle.generateKey(
          { name: "AES-GCM", length: 256 },
          true,
          ["encrypt", "decrypt"],
        );

        // 2. Encrypt plaintext
        const contentIv = crypto.getRandomValues(new Uint8Array(12));
        const encryptedContent = new Uint8Array(
          await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: contentIv },
            messageKey,
            new TextEncoder().encode(plaintext),
          ),
        );

        // 3. For each recipient, wrap message key using ephemeral ECDH
        const wrappedKeys = [];
        for (const recipient of recipients) {
          // Generate ephemeral X25519 key pair per recipient
          const ephemeralKp = await crypto.subtle.generateKey(
            { name: "X25519" },
            false,
            ["deriveKey", "deriveBits"],
          );

          // Import recipient's X25519 public key (raw 32 bytes)
          const recipientPub = await crypto.subtle.importKey(
            "raw",
            base64ToUint8(recipient.x25519PublicKey),
            { name: "X25519" },
            false,
            [],
          );

          // ECDH: ephemeral private x recipient public -> shared bits
          const sharedBits = await crypto.subtle.deriveBits(
            { name: "X25519", public: recipientPub },
            ephemeralKp.privateKey,
            256,
          );

          // HKDF: shared bits -> AES-256-GCM wrap key
          const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
          const wrapKey = await crypto.subtle.deriveKey(
            { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(MESSAGE_KEY_WRAP_INFO) },
            hkdfKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["wrapKey"],
          );

          // Wrap the message key
          const wrapIv = crypto.getRandomValues(new Uint8Array(12));
          const wrappedMsgKey = new Uint8Array(
            await crypto.subtle.wrapKey("raw", messageKey, wrapKey, { name: "AES-GCM", iv: wrapIv }),
          );

          // Concat wrapIv + wrappedMsgKey for storage
          const combined = new Uint8Array(12 + wrappedMsgKey.length);
          combined.set(wrapIv, 0);
          combined.set(wrappedMsgKey, 12);

          // Export ephemeral public key
          const ephPubBytes = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeralKp.publicKey));

          wrappedKeys.push({
            recipientUserId: recipient.userId,
            encryptedMessageKey: uint8ToBase64(combined),
            ephemeralPublicKey: uint8ToBase64(ephPubBytes),
          });
        }

        const encryptResult: EncryptMessageResultData = {
          encryptedContent: uint8ToBase64(encryptedContent),
          contentIv: uint8ToBase64(contentIv),
          recipients: wrappedKeys,
        };

        postResult(encryptResult);
        break;
      }

      // ----------------------------------------------------------
      // DECRYPT_MESSAGE: Decrypt a message ciphertext using cached private key
      // Reverses ECDH + HKDF + AES-256-GCM unwrap to recover plaintext
      // ----------------------------------------------------------
      case "DECRYPT_MESSAGE": {
        if (!_cachedKeys) throw new Error("Keys not unlocked — call LOGIN_DECRYPT first");

        const { encryptedContent, contentIv, encryptedMessageKey, ephemeralPublicKey } = payload;

        const encMsgKeyBytes = base64ToUint8(encryptedMessageKey);
        const wrapIv = encMsgKeyBytes.slice(0, 12);
        const wrappedKey = encMsgKeyBytes.slice(12);

        // Import ephemeral public key
        const ephPub = await crypto.subtle.importKey(
          "raw",
          base64ToUint8(ephemeralPublicKey),
          { name: "X25519" },
          false,
          [],
        );

        // ECDH: my private x ephemeral public -> same shared bits
        const sharedBits = await crypto.subtle.deriveBits(
          { name: "X25519", public: ephPub },
          _cachedKeys.x25519PrivateKey,
          256,
        );

        // HKDF -> unwrap key
        const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
        const unwrapKey = await crypto.subtle.deriveKey(
          { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(MESSAGE_KEY_WRAP_INFO) },
          hkdfKey,
          { name: "AES-GCM", length: 256 },
          false,
          ["unwrapKey"],
        );

        // Unwrap message key
        const messageKey = await crypto.subtle.unwrapKey(
          "raw",
          wrappedKey,
          unwrapKey,
          { name: "AES-GCM", iv: wrapIv },
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"],
        );

        // Decrypt content
        const plaintext = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: base64ToUint8(contentIv) },
          messageKey,
          base64ToUint8(encryptedContent),
        );

        const decryptResult: DecryptMessageResultData = {
          plaintext: new TextDecoder().decode(plaintext),
        };

        postResult(decryptResult);
        break;
      }

      default: {
        // Type-safe exhaustive check — TypeScript will catch unhandled cases
        const _exhaustive: never = type;
        postError(`Unknown message type: ${String(_exhaustive)}`);
      }
    }
  } catch (err) {
    postError((err as Error).message ?? "Unknown crypto error");
  }
};
