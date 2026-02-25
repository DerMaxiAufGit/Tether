import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { refreshTokens } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { verifyRefreshToken } from "../../lib/jwt.js";

export default async function logoutRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post("/logout", {
    handler: async (request, reply) => {
      const token = request.cookies?.refreshToken;

      if (token) {
        try {
          const payload = await verifyRefreshToken(token);
          if (payload.jti) {
            await db
              .delete(refreshTokens)
              .where(eq(refreshTokens.jti, payload.jti));
          }
        } catch {
          // Token invalid/expired — still clear the cookie
        }
      }

      // Clear the refresh cookie regardless
      reply.clearCookie("refreshToken", { path: "/api/auth/refresh" });

      return reply.code(200).send({ success: true });
    },
  });
}
