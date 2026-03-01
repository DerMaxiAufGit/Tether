import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import {
  channels,
  serverMembers,
  dmParticipants,
  channelReadStates,
} from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

/**
 * POST /api/channels/:channelId/mark-read — Upserts last_read_at to NOW() for the authenticated user.
 *
 * Also emits an `unread:cleared` socket event to the user's personal room
 * so that other open tabs update their unread cache immediately.
 *
 * Returns: 204 No Content
 */
export default async function markReadRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { channelId: string } }>(
    "/channels/:channelId/mark-read",
    {
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

        // Look up the channel to determine its type
        const [channel] = await db
          .select({ id: channels.id, serverId: channels.serverId, type: channels.type })
          .from(channels)
          .where(eq(channels.id, channelId))
          .limit(1);

        if (!channel) {
          return reply.code(404).send({ error: "Channel not found" });
        }

        // Verify access
        if (channel.type === "dm") {
          const [dmMembership] = await db
            .select({ id: dmParticipants.id })
            .from(dmParticipants)
            .where(
              and(eq(dmParticipants.channelId, channelId), eq(dmParticipants.userId, userId)),
            )
            .limit(1);

          if (!dmMembership) {
            return reply.code(403).send({ error: "You are not a participant in this DM" });
          }
        } else if (channel.serverId) {
          const [membership] = await db
            .select({ id: serverMembers.id })
            .from(serverMembers)
            .where(
              and(eq(serverMembers.serverId, channel.serverId), eq(serverMembers.userId, userId)),
            )
            .limit(1);

          if (!membership) {
            return reply.code(403).send({ error: "You are not a member of this server" });
          }
        } else {
          return reply.code(403).send({ error: "Access denied" });
        }

        // Upsert lastReadAt to NOW()
        await db
          .insert(channelReadStates)
          .values({
            userId,
            channelId,
            lastReadAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [channelReadStates.userId, channelReadStates.channelId],
            set: { lastReadAt: new Date() },
          });

        // Notify other tabs that this channel has been marked as read
        fastify.io.to(`user:${userId}`).emit("unread:cleared", { channelId });

        return reply.code(204).send();
      },
    },
  );
}
