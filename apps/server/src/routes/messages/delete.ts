import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { messages, channels } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { PERMISSIONS } from "@tether/shared";
import { requirePermission } from "../../lib/permissions.js";

/**
 * DELETE /api/messages/:messageId — Delete an owned message.
 *
 * Only the sender can delete their own messages. Cascade removes recipient keys.
 * Broadcasts message:deleted to the channel:{channelId} Socket.IO room.
 */
export default async function deleteMessageRoute(fastify: FastifyInstance): Promise<void> {
  fastify.delete<{ Params: { messageId: string } }>("/:messageId", {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: "object",
        required: ["messageId"],
        properties: {
          messageId: { type: "string", format: "uuid" },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { messageId } = request.params;

      // Look up the message to verify ownership and get channelId
      const [message] = await db
        .select({
          id: messages.id,
          senderId: messages.senderId,
          channelId: messages.channelId,
        })
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (!message) {
        return reply.code(404).send({ error: "Message not found" });
      }

      const { channelId } = message;

      // Look up channel to get serverId for broadcast context
      const [channel] = await db
        .select({ serverId: channels.serverId })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      // Sender can always delete own messages; otherwise check MANAGE_MESSAGES
      if (message.senderId !== userId) {
        if (!channel?.serverId) {
          return reply.code(403).send({ error: "You can only delete your own messages" });
        }
        const auth = await requirePermission(userId, channel.serverId, PERMISSIONS.MANAGE_MESSAGES);
        if (!auth) {
          return reply.code(403).send({ error: "You can only delete your own messages" });
        }
      }

      // Delete message (cascade removes message_recipient_keys rows)
      await db.delete(messages).where(eq(messages.id, messageId));

      // Broadcast deletion to all channel room members
      fastify.io?.to(`channel:${channelId}`).emit("message:deleted", {
        messageId,
        channelId,
        serverId: channel?.serverId ?? null,
      });

      return reply.code(200).send({ success: true });
    },
  });
}
