import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import * as argon2 from "argon2";
import { db } from "../../db/client.js";
import { users, refreshTokens } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { signAccessToken, signRefreshToken } from "../../lib/jwt.js";
import type { AuthLoginRequest } from "@tether/shared";

export default async function loginRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: AuthLoginRequest }>("/login", {
    schema: {
      body: {
        type: "object",
        required: ["email", "authKey"],
        properties: {
          email: { type: "string" },
          authKey: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const { email, authKey } = request.body;

      // Find user by email — use consistent error to avoid email enumeration
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!user) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      // Verify authKey against Argon2id hash
      const authKeyBuffer = Buffer.from(authKey, "base64");
      const valid = await argon2.verify(user.authKeyHash, authKeyBuffer);

      if (!valid) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      // Create refresh token
      const jti = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(refreshTokens).values({
        userId: user.id,
        jti,
        expiresAt,
      });

      // Sign tokens
      const accessToken = await signAccessToken(user.id);
      const refreshToken = await signRefreshToken(user.id, jti);

      // Set refresh cookie
      const isProduction = process.env.NODE_ENV === "production";
      reply.setCookie("refreshToken", refreshToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/api/auth/refresh",
        maxAge: 7 * 24 * 60 * 60,
      });

      // Convert Buffer values from DB to base64 for the response
      return reply.code(200).send({
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
        keyBundle: {
          salt: (user.kdfSalt as Buffer).toString("base64"),
          x25519PublicKey: (user.x25519PublicKey as Buffer).toString("base64"),
          ed25519PublicKey: (user.ed25519PublicKey as Buffer).toString("base64"),
          x25519EncryptedPrivateKey: (user.x25519EncryptedPrivateKey as Buffer).toString("base64"),
          x25519KeyIv: (user.x25519KeyIv as Buffer).toString("base64"),
          ed25519EncryptedPrivateKey: (user.ed25519EncryptedPrivateKey as Buffer).toString("base64"),
          ed25519KeyIv: (user.ed25519KeyIv as Buffer).toString("base64"),
        },
      });
    },
  });
}
