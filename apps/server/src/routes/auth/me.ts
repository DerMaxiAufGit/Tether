import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * Auth "me" routes — both require authentication.
 *
 * GET /api/auth/me
 *   Returns current user's profile info.
 *
 * GET /api/auth/me/keys
 *   Returns current user's encrypted key bundle (salt + blobs + IVs).
 *   Used by the change-password flow to retrieve current key material
 *   for re-encryption.
 */
export default async function meRoute(fastify: FastifyInstance): Promise<void> {
  // GET /api/auth/me — current user profile
  fastify.get("/me", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;

      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          status: users.status,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }

      return reply.code(200).send({ user });
    },
  });

  // GET /api/auth/me/keys — encrypted key bundle for change-password
  fastify.get("/me/keys", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;

      const [user] = await db
        .select({
          kdfSalt: users.kdfSalt,
          x25519EncryptedPrivateKey: users.x25519EncryptedPrivateKey,
          x25519KeyIv: users.x25519KeyIv,
          ed25519EncryptedPrivateKey: users.ed25519EncryptedPrivateKey,
          ed25519KeyIv: users.ed25519KeyIv,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }

      return reply.code(200).send({
        salt: (user.kdfSalt as Buffer).toString("base64"),
        x25519EncryptedPrivateKey: (user.x25519EncryptedPrivateKey as Buffer).toString("base64"),
        x25519KeyIv: (user.x25519KeyIv as Buffer).toString("base64"),
        ed25519EncryptedPrivateKey: (user.ed25519EncryptedPrivateKey as Buffer).toString("base64"),
        ed25519KeyIv: (user.ed25519KeyIv as Buffer).toString("base64"),
      });
    },
  });
}
