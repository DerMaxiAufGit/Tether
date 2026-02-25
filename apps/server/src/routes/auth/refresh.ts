import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { refreshTokens } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt.js";
import { sql } from "drizzle-orm";

export default async function refreshRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post("/refresh", {
    handler: async (request, reply) => {
      const token = request.cookies?.refreshToken;

      if (!token) {
        return reply.code(401).send({ error: "Refresh token required" });
      }

      // Verify the refresh token signature and expiry
      let payload;
      try {
        payload = await verifyRefreshToken(token);
      } catch {
        reply.clearCookie("refreshToken", { path: "/api/auth/refresh" });
        return reply.code(401).send({ error: "Invalid or expired refresh token" });
      }

      const { jti, sub: userId } = payload;

      if (!jti || !userId) {
        reply.clearCookie("refreshToken", { path: "/api/auth/refresh" });
        return reply.code(401).send({ error: "Invalid refresh token" });
      }

      // Use a transaction with SELECT FOR UPDATE to prevent replay attacks
      let newJti: string;
      let newRefreshToken: string;
      let accessToken: string;

      try {
        await db.transaction(async (tx) => {
          // SELECT FOR UPDATE — locks the row to prevent concurrent token use
          const rows = await tx.execute(
            sql`SELECT id, user_id, jti FROM refresh_tokens WHERE jti = ${jti} FOR UPDATE`
          );

          // postgres.js RowList extends the array directly — index 0 is the first row
          const existing = (rows as unknown as Array<{ id: string; user_id: string; jti: string }>)[0];

          if (!existing) {
            // Replay attack detected — revoke ALL refresh tokens for this user
            await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
            reply.clearCookie("refreshToken", { path: "/api/auth/refresh" });
            throw Object.assign(new Error("Token reuse detected"), { statusCode: 401 });
          }

          // Delete the consumed token
          await tx.delete(refreshTokens).where(eq(refreshTokens.jti, jti));

          // Insert new refresh token
          newJti = randomUUID();
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

          await tx.insert(refreshTokens).values({
            userId,
            jti: newJti,
            expiresAt,
          });

          // Sign new tokens
          accessToken = await signAccessToken(userId);
          newRefreshToken = await signRefreshToken(userId, newJti);
        });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        if (error.statusCode === 401) {
          return reply.code(401).send({ error: error.message });
        }
        throw err;
      }

      // Set new refresh cookie
      const isProduction = process.env.NODE_ENV === "production";
      reply.setCookie("refreshToken", newRefreshToken!, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/api/auth/refresh",
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.code(200).send({ accessToken: accessToken! });
    },
  });
}
