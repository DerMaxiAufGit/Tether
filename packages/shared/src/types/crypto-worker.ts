// ============================================================
// Crypto Worker Message Types
// Main thread <-> Web Worker communication protocol
// All binary data transmitted as base64 strings
// ============================================================

// ---- Request types (main thread -> worker) -----------------

export interface DeriveKeysRequest {
  type: "DERIVE_KEYS";
  id: string;
  payload: {
    password: string;
    salt: string; // base64
  };
}

export interface RegisterRequest {
  type: "REGISTER";
  id: string;
  payload: {
    password: string;
  };
}

export interface LoginDecryptRequest {
  type: "LOGIN_DECRYPT";
  id: string;
  payload: {
    password: string;
    salt: string; // base64
    x25519Blob: string; // base64
    x25519Iv: string; // base64
    ed25519Blob: string; // base64
    ed25519Iv: string; // base64
  };
}

export interface ChangePasswordRequest {
  type: "CHANGE_PASSWORD";
  id: string;
  payload: {
    currentPassword: string;
    newPassword: string;
    currentSalt: string; // base64
    x25519Blob: string; // base64
    x25519Iv: string; // base64
    ed25519Blob: string; // base64
    ed25519Iv: string; // base64
  };
}

export type CryptoWorkerRequest =
  | DeriveKeysRequest
  | RegisterRequest
  | LoginDecryptRequest
  | ChangePasswordRequest;

// ---- Result data shapes ------------------------------------

export interface RegisterResultData {
  authKey: string; // base64
  salt: string; // base64
  x25519PublicKey: string; // base64
  ed25519PublicKey: string; // base64
  x25519EncryptedPrivateKey: string; // base64
  x25519KeyIv: string; // base64
  ed25519EncryptedPrivateKey: string; // base64
  ed25519KeyIv: string; // base64
}

export interface LoginDecryptResultData {
  authKey: string; // base64
}

export interface ChangePasswordResultData {
  oldAuthKey: string; // base64 — for server verification
  newAuthKey: string; // base64
  newSalt: string; // base64
  x25519EncryptedPrivateKey: string; // base64
  x25519KeyIv: string; // base64
  ed25519EncryptedPrivateKey: string; // base64
  ed25519KeyIv: string; // base64
}

// ---- Response types (worker -> main thread) ----------------

export type ProgressStep =
  | "deriving"
  | "generating"
  | "encrypting"
  | "decrypting"
  | "re-encrypting"
  | "done";

export interface ProgressResponse {
  type: "PROGRESS";
  id: string;
  step: ProgressStep;
}

export interface ResultResponse<T = unknown> {
  type: "RESULT";
  id: string;
  success: true;
  data: T;
}

export interface ErrorResponse {
  type: "ERROR";
  id: string;
  success: false;
  error: string;
}

export type CryptoWorkerResponse =
  | ProgressResponse
  | ResultResponse<RegisterResultData>
  | ResultResponse<LoginDecryptResultData>
  | ResultResponse<ChangePasswordResultData>
  | ErrorResponse;

// ---- Convenience type aliases ------------------------------

export type CryptoWorkerMessage = CryptoWorkerRequest;
