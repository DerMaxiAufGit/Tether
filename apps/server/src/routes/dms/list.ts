import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels, dmParticipants, messages, users } from "../../db/schema.js";
import { eq, and, desc, max, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

/**
 * GET /api/dms — List all DM conversations for the authenticated user.
 *
 * Returns conversations sorted by most recent message (lastMessageAt DESC, NULLs last).
 * Each conversation includes the other participant's profile info.
 *
 * Response: { conversations: DMConversationResponse[] }
 */
export default async function listDMsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;

      // Alias dmParticipants to distinguish self from other
      const selfDp = alias(dmParticipants, "self_dp");
      const otherDp = alias(dmParticipants, "other_dp");

      // Query all DM channels the user participates in, with the other participant's info
      // and the latest message timestamp for sorting
      const rows = await db
        .select({
          channelId: channels.id,
          otherId: users.id,
          otherDisplayName: users.displayName,
          otherAvatarUrl: users.avatarUrl,
          otherX25519PublicKey: users.x25519PublicKey,
          lastMessageAt: max(messages.createdAt),
        })
        .from(selfDp)
        .innerJoin(channels, and(eq(channels.id, selfDp.channelId), eq(channels.type, "dm")))
        .innerJoin(otherDp, and(eq(otherDp.channelId, channels.id), ne(otherDp.userId, userId)))
        .innerJoin(users, eq(users.id, otherDp.userId))
        .leftJoin(messages, eq(messages.channelId, channels.id))
        .where(eq(selfDp.userId, userId))
        .groupBy(channels.id, users.id, users.displayName, users.avatarUrl, users.x25519PublicKey)
        .orderBy(desc(max(messages.createdAt)));

      const conversations = rows.map((row) => ({
        channelId: row.channelId,
        participant: {
          id: row.otherId,
          displayName: row.otherDisplayName,
          avatarUrl: row.otherAvatarUrl,
          x25519PublicKey: row.otherX25519PublicKey
            ? Buffer.from(row.otherX25519PublicKey).toString("base64")
            : "",
        },
        lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
      }));

      return reply.code(200).send({ conversations });
    },
  });
}
