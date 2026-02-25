export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  x25519PublicKey: string; // base64 for transport
  ed25519PublicKey: string; // base64 for transport
}
