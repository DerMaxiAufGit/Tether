import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  uniqueIndex,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";
import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";

// bytea is not exported from drizzle-orm/pg-core directly (as of v0.45.x)
// Use customType to define it. Returns Buffer from postgres.js driver.
// See: RESEARCH.md Pitfall 6 — treat DB values as Buffer, convert to Uint8Array at crypto boundary
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

// ---------------------------------------------------------------------------
// users — Core auth + crypto key storage
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  authKeyHash: text("auth_key_hash").notNull(),

  // Crypto: public keys (unencrypted, public by design)
  x25519PublicKey: bytea("x25519_public_key").notNull(),
  ed25519PublicKey: bytea("ed25519_public_key").notNull(),

  // Crypto: AES-256-GCM encrypted private key blobs
  x25519EncryptedPrivateKey: bytea("x25519_encrypted_private_key").notNull(),
  ed25519EncryptedPrivateKey: bytea("ed25519_encrypted_private_key").notNull(),

  // AES-GCM nonces for the encrypted private keys (12-byte each)
  x25519KeyIv: bytea("x25519_key_iv").notNull(),
  ed25519KeyIv: bytea("ed25519_key_iv").notNull(),

  // PBKDF2 salt (32 bytes) — returned to client on login so they can re-derive keys
  kdfSalt: bytea("kdf_salt").notNull(),

  // Recovery key hash (one-time; actual key shown to user only once at registration)
  recoveryKeyHash: text("recovery_key_hash"),

  avatarUrl: text("avatar_url"),
  status: text("status").default("online"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

// ---------------------------------------------------------------------------
// refresh_tokens — JWT refresh token rotation via jti
// ---------------------------------------------------------------------------

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  jti: text("jti").notNull().unique(), // JWT ID for rotation detection
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type RefreshToken = InferSelectModel<typeof refreshTokens>;
export type NewRefreshToken = InferInsertModel<typeof refreshTokens>;

// ---------------------------------------------------------------------------
// servers — Discord-like guilds
// ---------------------------------------------------------------------------

export const servers = pgTable("servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  iconUrl: text("icon_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Server = InferSelectModel<typeof servers>;
export type NewServer = InferInsertModel<typeof servers>;

// ---------------------------------------------------------------------------
// channels — Text and voice channels within servers
// ---------------------------------------------------------------------------

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id")
    .references(() => servers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("text"), // "text" | "voice" | "dm"
  topic: text("topic"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Channel = InferSelectModel<typeof channels>;
export type NewChannel = InferInsertModel<typeof channels>;

// ---------------------------------------------------------------------------
// messages — Encrypted message storage (ciphertext only; server never sees plaintext)
// ---------------------------------------------------------------------------

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => users.id),
  // AES-256-GCM ciphertext of the message
  encryptedContent: bytea("encrypted_content").notNull(),
  // Per-message 12-byte AES-GCM nonce
  contentIv: bytea("content_iv").notNull(),
  contentAlgorithm: text("content_algorithm").notNull().default("aes-256-gcm"),
  // Key rotation epoch — incremented when channel key is rotated
  epoch: integer("epoch").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  editedAt: timestamp("edited_at"),
});

export type Message = InferSelectModel<typeof messages>;
export type NewMessage = InferInsertModel<typeof messages>;

// ---------------------------------------------------------------------------
// message_recipient_keys — Per-recipient wrapped message AES key
// Each recipient gets the message's AES key encrypted with their X25519 public key
// ---------------------------------------------------------------------------

export const messageRecipientKeys = pgTable(
  "message_recipient_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id),
    // Message AES key wrapped with recipient's X25519 public key
    encryptedMessageKey: bytea("encrypted_message_key").notNull(),
    // Sender's ephemeral X25519 public key for this key-wrap operation (ECDH)
    ephemeralPublicKey: bytea("ephemeral_public_key").notNull(),
  },
  (t) => [uniqueIndex("mrk_message_recipient_idx").on(t.messageId, t.recipientUserId)],
);

export type MessageRecipientKey = InferSelectModel<typeof messageRecipientKeys>;
export type NewMessageRecipientKey = InferInsertModel<typeof messageRecipientKeys>;

// ---------------------------------------------------------------------------
// dm_participants — Two-user join table for DM channels
// DM channels have serverId = null and type = "dm"
// ---------------------------------------------------------------------------

export const dmParticipants = pgTable(
  "dm_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("dm_participants_channel_user_idx").on(t.channelId, t.userId),
  ],
);

export type DmParticipant = InferSelectModel<typeof dmParticipants>;
export type NewDmParticipant = InferInsertModel<typeof dmParticipants>;

// ---------------------------------------------------------------------------
// server_members — Membership join table
// ---------------------------------------------------------------------------

export const serverMembers = pgTable(
  "server_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("sm_server_user_idx").on(t.serverId, t.userId)],
);

export type ServerMember = InferSelectModel<typeof serverMembers>;
export type NewServerMember = InferInsertModel<typeof serverMembers>;

// ---------------------------------------------------------------------------
// roles — Server-scoped roles with permission bitfields
// ---------------------------------------------------------------------------

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id")
    .notNull()
    .references(() => servers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Stored as string to avoid JS 32-bit integer limit on bitfields
  permissions: text("permissions").notNull().default("0"),
  color: text("color"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Role = InferSelectModel<typeof roles>;
export type NewRole = InferInsertModel<typeof roles>;

// ---------------------------------------------------------------------------
// member_roles — Many-to-many server_members ↔ roles
// ---------------------------------------------------------------------------

export const memberRoles = pgTable(
  "member_roles",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => serverMembers.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.roleId] })],
);

export type MemberRole = InferSelectModel<typeof memberRoles>;
export type NewMemberRole = InferInsertModel<typeof memberRoles>;

// ---------------------------------------------------------------------------
// invites — Server invite codes
// ---------------------------------------------------------------------------

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id")
    .notNull()
    .references(() => servers.id, { onDelete: "cascade" }),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id),
  code: text("code").notNull().unique(),
  maxUses: integer("max_uses"),
  uses: integer("uses").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Invite = InferSelectModel<typeof invites>;
export type NewInvite = InferInsertModel<typeof invites>;

// ---------------------------------------------------------------------------
// channel_overrides — Per-channel role permission overrides
// ---------------------------------------------------------------------------

export const channelOverrides = pgTable(
  "channel_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    // Bitfields stored as strings (same as roles.permissions)
    allow: text("allow").notNull().default("0"),
    deny: text("deny").notNull().default("0"),
  },
  (t) => [uniqueIndex("co_channel_role_idx").on(t.channelId, t.roleId)],
);

export type ChannelOverride = InferSelectModel<typeof channelOverrides>;
export type NewChannelOverride = InferInsertModel<typeof channelOverrides>;
