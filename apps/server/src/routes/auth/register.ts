import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import * as argon2 from "argon2";
import { db } from "../../db/client.js";
import { users, refreshTokens } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { signAccessToken, signRefreshToken } from "../../lib/jwt.js";
import type { AuthRegisterRequest } from "@tether/shared";

export default async function registerRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: AuthRegisterRequest }>("/register", {
    schema: {
      body: {
        type: "object",
        required: [
          "email",
          "displayName",
          "authKey",
          "salt",
          "x25519PublicKey",
          "ed25519PublicKey",
          "x25519EncryptedPrivateKey",
          "x25519KeyIv",
          "ed25519EncryptedPrivateKey",
          "ed25519KeyIv",
          "recoveryKeyHash",
        ],
        properties: {
          email: { type: "string", format: "email" },
          displayName: { type: "string", minLength: 1, maxLength: 50 },
          authKey: { type: "string" },
          salt: { type: "string" },
          x25519PublicKey: { type: "string" },
          ed25519PublicKey: { type: "string" },
          x25519EncryptedPrivateKey: { type: "string" },
          x25519KeyIv: { type: "string" },
          ed25519EncryptedPrivateKey: { type: "string" },
          ed25519KeyIv: { type: "string" },
          recoveryKeyHash: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const {
        email,
        displayName,
        authKey,
        salt,
        x25519PublicKey,
        ed25519PublicKey,
        x25519EncryptedPrivateKey,
        x25519KeyIv,
        ed25519EncryptedPrivateKey,
        ed25519KeyIv,
        recoveryKeyHash,
      } = request.body;

      // Check email uniqueness
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (existing.length > 0) {
        return reply.code(409).send({ error: "Email already registered" });
      }

      // Hash authKey with Argon2id
      const authKeyBuffer = Buffer.from(authKey, "base64");
      const authKeyHash = await argon2.hash(authKeyBuffer, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      // Decode all base64 blobs to Buffers for storage
      const saltBuffer = Buffer.from(salt, "base64");
      const x25519PubKeyBuffer = Buffer.from(x25519PublicKey, "base64");
      const ed25519PubKeyBuffer = Buffer.from(ed25519PublicKey, "base64");
      const x25519EncPrivKeyBuffer = Buffer.from(x25519EncryptedPrivateKey, "base64");
      const x25519IvBuffer = Buffer.from(x25519KeyIv, "base64");
      const ed25519EncPrivKeyBuffer = Buffer.from(ed25519EncryptedPrivateKey, "base64");
      const ed25519IvBuffer = Buffer.from(ed25519KeyIv, "base64");

      // Insert user
      const [newUser] = await db
        .insert(users)
        .values({
          email: email.toLowerCase(),
          displayName,
          authKeyHash,
          kdfSalt: saltBuffer,
          x25519PublicKey: x25519PubKeyBuffer,
          ed25519PublicKey: ed25519PubKeyBuffer,
          x25519EncryptedPrivateKey: x25519EncPrivKeyBuffer,
          x25519KeyIv: x25519IvBuffer,
          ed25519EncryptedPrivateKey: ed25519EncPrivKeyBuffer,
          ed25519KeyIv: ed25519IvBuffer,
          recoveryKeyHash,
        })
        .returning({ id: users.id, email: users.email, displayName: users.displayName });

      // Create refresh token
      const jti = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(refreshTokens).values({
        userId: newUser.id,
        jti,
        expiresAt,
      });

      // Sign tokens
      const accessToken = await signAccessToken(newUser.id);
      const refreshToken = await signRefreshToken(newUser.id, jti);

      // Set refresh cookie
      const isProduction = process.env.NODE_ENV === "production";
      reply.setCookie("refreshToken", refreshToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/api/auth/refresh",
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.code(201).send({
        accessToken,
        user: {
          id: newUser.id,
          email: newUser.email,
          displayName: newUser.displayName,
          avatarUrl: null,
        },
      });
    },
  });
}
