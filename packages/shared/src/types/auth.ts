// REST API auth request/response types
// Note: RegisterRequest and ChangePasswordRequest names are taken by crypto-worker types.
// These are the HTTP API shapes — prefixed with "Auth" to avoid ambiguity.

export interface AuthRegisterRequest {
  email: string;
  displayName: string;
  authKey: string;                       // base64 — server hashes this with Argon2id
  salt: string;                          // base64 — PBKDF2 salt for key re-derivation
  x25519PublicKey: string;               // base64
  ed25519PublicKey: string;              // base64
  x25519EncryptedPrivateKey: string;     // base64
  x25519KeyIv: string;                   // base64
  ed25519EncryptedPrivateKey: string;    // base64
  ed25519KeyIv: string;                  // base64
  recoveryKeyHash: string;               // base64 — hash of user's recovery key
}

export interface AuthLoginRequest {
  email: string;
  authKey: string;                       // base64
}

export interface AuthLoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  keyBundle: {
    salt: string;
    x25519PublicKey: string;
    ed25519PublicKey: string;
    x25519EncryptedPrivateKey: string;
    x25519KeyIv: string;
    ed25519EncryptedPrivateKey: string;
    ed25519KeyIv: string;
  };
}

export interface AuthRefreshResponse {
  accessToken: string;
}

export interface AuthChangePasswordRequest {
  oldAuthKey: string;
  newAuthKey: string;
  newSalt: string;
  x25519EncryptedPrivateKey: string;
  x25519KeyIv: string;
  ed25519EncryptedPrivateKey: string;
  ed25519KeyIv: string;
}
