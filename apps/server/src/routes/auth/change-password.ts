import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import * as argon2 from "argon2";
import { db } from "../../db/client.js";
import { users, refreshTokens } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { signAccessToken, signRefreshToken } from "../../lib/jwt.js";
import type { AuthChangePasswordRequest } from "@tether/shared";

export default async function changePasswordRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: AuthChangePasswordRequest }>("/change-password", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: [
          "oldAuthKey",
          "newAuthKey",
          "newSalt",
          "x25519EncryptedPrivateKey",
          "x25519KeyIv",
          "ed25519EncryptedPrivateKey",
          "ed25519KeyIv",
        ],
        properties: {
          oldAuthKey: { type: "string" },
          newAuthKey: { type: "string" },
          newSalt: { type: "string" },
          x25519EncryptedPrivateKey: { type: "string" },
          x25519KeyIv: { type: "string" },
          ed25519EncryptedPrivateKey: { type: "string" },
          ed25519KeyIv: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const {
        oldAuthKey,
        newAuthKey,
        newSalt,
        x25519EncryptedPrivateKey,
        x25519KeyIv,
        ed25519EncryptedPrivateKey,
        ed25519KeyIv,
      } = request.body;

      let accessToken: string;
      let refreshToken: string;
      let userEmail: string;
      let userDisplayName: string;

      try {
        await db.transaction(async (tx) => {
          // SELECT FOR UPDATE on user row — prevent concurrent password changes
          const rows = await tx.execute(
            sql`SELECT id, auth_key_hash, email, display_name FROM users WHERE id = ${userId} FOR UPDATE`
          );

          // postgres.js RowList extends the array directly — index 0 is the first row
          const user = (rows as unknown as Array<{ id: string; auth_key_hash: string; email: string; display_name: string }>)[0];

          if (!user) {
            throw Object.assign(new Error("User not found"), { statusCode: 404 });
          }

          // Verify old auth key
          const oldAuthKeyBuffer = Buffer.from(oldAuthKey, "base64");
          const valid = await argon2.verify(user.auth_key_hash, oldAuthKeyBuffer);

          if (!valid) {
            throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
          }

          // Hash new auth key
          const newAuthKeyBuffer = Buffer.from(newAuthKey, "base64");
          const newAuthKeyHash = await argon2.hash(newAuthKeyBuffer, {
            type: argon2.argon2id,
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 4,
          });

          // Decode new blobs
          const newSaltBuffer = Buffer.from(newSalt, "base64");
          const x25519EncPrivKeyBuffer = Buffer.from(x25519EncryptedPrivateKey, "base64");
          const x25519IvBuffer = Buffer.from(x25519KeyIv, "base64");
          const ed25519EncPrivKeyBuffer = Buffer.from(ed25519EncryptedPrivateKey, "base64");
          const ed25519IvBuffer = Buffer.from(ed25519KeyIv, "base64");

          // Update user atomically
          await tx
            .update(users)
            .set({
              authKeyHash: newAuthKeyHash,
              kdfSalt: newSaltBuffer,
              x25519EncryptedPrivateKey: x25519EncPrivKeyBuffer,
              x25519KeyIv: x25519IvBuffer,
              ed25519EncryptedPrivateKey: ed25519EncPrivKeyBuffer,
              ed25519KeyIv: ed25519IvBuffer,
              updatedAt: new Date(),
            })
            .where(eq(users.id, userId));

          // Revoke all refresh tokens — force re-login on other devices
          await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));

          // Create a new session for the current device
          const jti = randomUUID();
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

          await tx.insert(refreshTokens).values({
            userId,
            jti,
            expiresAt,
          });

          accessToken = await signAccessToken(userId);
          refreshToken = await signRefreshToken(userId, jti);
          userEmail = user.email;
          userDisplayName = user.display_name;
        });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 401) {
          return reply.code(401).send({ error: error.message });
        }
        if (error.statusCode === 404) {
          return reply.code(404).send({ error: error.message });
        }
        throw err;
      }

      // Set refresh cookie for the new session
      const isProduction = process.env.NODE_ENV === "production";
      reply.setCookie("refreshToken", refreshToken!, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/api/auth/refresh",
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.code(200).send({
        accessToken: accessToken!,
        user: {
          id: userId,
          email: userEmail!,
          displayName: userDisplayName!,
        },
      });
    },
  });
}
