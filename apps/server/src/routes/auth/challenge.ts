import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * POST /api/auth/challenge
 *
 * Public endpoint — no authentication required.
 * Used by the client to fetch the KDF salt before login.
 *
 * Security design:
 *   - If user exists: returns { salt: <user's actual kdfSalt as base64> }
 *   - If user does NOT exist: returns { salt: <deterministic fake salt> }
 *   - The fake salt is derived via HMAC(CHALLENGE_SECRET, email) to ensure:
 *     a) The same email always gets the same fake salt (timing consistency)
 *     b) The fake salt is indistinguishable from a real one
 *     c) Attackers cannot enumerate existing emails via the salt endpoint
 */
export default async function challengeRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: { email: string } }>("/challenge", {
    schema: {
      body: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const { email } = request.body;
      const normalizedEmail = email.toLowerCase().trim();

      // Try to find the user
      const [user] = await db
        .select({ kdfSalt: users.kdfSalt })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (user?.kdfSalt) {
        // User exists: return actual salt
        return reply.code(200).send({
          salt: (user.kdfSalt as Buffer).toString("base64"),
        });
      }

      // User does NOT exist: return deterministic fake salt
      // HMAC ensures same email always gets same fake salt (prevents timing oracle)
      const secret =
        process.env.CHALLENGE_SECRET ??
        process.env.COOKIE_SECRET ??
        "tether-challenge-fallback-secret";

      const hmac = createHmac("sha256", secret);
      hmac.update(normalizedEmail);
      const fakeSalt = hmac.digest().subarray(0, 32); // First 32 bytes = 256 bits

      return reply.code(200).send({
        salt: fakeSalt.toString("base64"),
      });
    },
  });
}
