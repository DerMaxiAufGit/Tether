// Encrypted private key blob as stored/transmitted
export interface EncryptedKeyBlob {
  ciphertext: Uint8Array; // AES-256-GCM encrypted PKCS8 key
  iv: Uint8Array; // 12-byte nonce
}

// Full key bundle returned to client on login
export interface KeyBundle {
  x25519PublicKey: Uint8Array;
  ed25519PublicKey: Uint8Array;
  x25519EncryptedPrivateKey: EncryptedKeyBlob;
  ed25519EncryptedPrivateKey: EncryptedKeyBlob;
  kdfSalt: Uint8Array;
}

// Key derivation parameters
export interface KdfParams {
  algorithm: "PBKDF2-SHA256";
  iterations: number;
  saltLength: number;
  hkdfInfo: {
    auth: string; // e.g., "tether-auth-key-v1"
    encryption: string; // e.g., "tether-encryption-key-v1"
  };
}

// Constants — OWASP 2025 recommendation for PBKDF2-HMAC-SHA256
export const KDF_ITERATIONS = 600_000;
export const KDF_SALT_LENGTH = 32;
export const AES_GCM_IV_LENGTH = 12;
export const AUTH_HKDF_INFO = "tether-auth-key-v1";
export const ENCRYPTION_HKDF_INFO = "tether-encryption-key-v1";
export const MESSAGE_KEY_WRAP_INFO = "tether-message-key-wrap-v1";
export const FILE_KEY_WRAP_INFO = "tether-file-key-wrap-v1";
