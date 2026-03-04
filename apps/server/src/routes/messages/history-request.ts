import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels, serverMembers, messages, messageRecipientKeys, historyRequests, users } from "../../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import type { HistoryRequestedEvent } from "@tether/shared";

/**
 * POST /api/channels/:channelId/history-request
 *
 * Creates a pending history request for the authenticated user.
 * Broadcasts history:requested to the server room so other members can grant access.
 */
export default async function historyRequestRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{
    Params: { channelId: string };
  }>("/:channelId/history-request", {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: "object",
        required: ["channelId"],
        properties: {
          channelId: { type: "string", format: "uuid" },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { channelId } = request.params;

      // Verify channel exists and user has access
      const [channel] = await db
        .select({ id: channels.id, serverId: channels.serverId })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      if (!channel || !channel.serverId) {
        return reply.code(404).send({ error: "Channel not found" });
      }

      const [membership] = await db
        .select({ id: serverMembers.id })
        .from(serverMembers)
        .where(and(eq(serverMembers.serverId, channel.serverId), eq(serverMembers.userId, userId)))
        .limit(1);

      if (!membership) {
        return reply.code(403).send({ error: "Not a member of this server" });
      }

      // Check if there's already a pending request
      const [existing] = await db
        .select({ id: historyRequests.id })
        .from(historyRequests)
        .where(
          and(
            eq(historyRequests.channelId, channelId),
            eq(historyRequests.requesterId, userId),
            eq(historyRequests.status, "pending"),
          ),
        )
        .limit(1);

      if (existing) {
        return reply.code(409).send({ error: "A pending request already exists", requestId: existing.id });
      }

      // Count undecryptable messages
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.channelId, channelId),
            sql`NOT EXISTS (
              SELECT 1 FROM message_recipient_keys
              WHERE message_recipient_keys.message_id = messages.id
              AND message_recipient_keys.recipient_user_id = ${userId}
            )`,
          ),
        );

      const messageCount = countResult?.count ?? 0;

      // Create the request
      const [newRequest] = await db
        .insert(historyRequests)
        .values({
          channelId,
          requesterId: userId,
          status: "pending",
        })
        .returning({ id: historyRequests.id });

      // Get requester's display name
      const [requester] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      // Broadcast to server room
      if (fastify.io) {
        const event: HistoryRequestedEvent = {
          requestId: newRequest.id,
          channelId,
          requesterId: userId,
          requesterDisplayName: requester?.displayName ?? "Unknown",
          messageCount,
        };
        fastify.io.to(`server:${channel.serverId}`).emit("history:requested", event);
      }

      return reply.code(201).send({ requestId: newRequest.id, messageCount });
    },
  });
}
