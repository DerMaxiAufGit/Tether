import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { TurnCredentialsResponse } from "@tether/shared";

function generateTurnCredentials(userId: string): {
  username: string;
  credential: string;
  ttl: number;
} {
  const secret = process.env.COTURN_SECRET;
  if (!secret) throw new Error("COTURN_SECRET not configured");
  const ttl = 86400; // 24 hours
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const username = `${expiry}:${userId}`;
  const credential = crypto.createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential, ttl };
}

/**
 * GET /api/voice/turn-credentials — Return time-limited TURN credentials for the authenticated user.
 *
 * Uses HMAC-SHA1 with COTURN_SECRET matching the Coturn server's static-auth-secret.
 * Credentials are ephemeral (24h TTL) and bound to the user's ID.
 */
export default async function voiceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/turn-credentials", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const host = process.env.COTURN_HOST ?? "localhost";

      const { username, credential } = generateTurnCredentials(userId);

      const response: TurnCredentialsResponse = {
        iceServers: [
          { urls: `stun:${host}:3478` },
          { urls: `turn:${host}:3478`, username, credential },
          { urls: `turns:${host}:5349`, username, credential },
        ],
      };

      return reply.code(200).send(response);
    },
  });
}
