import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { messages, messageReactions } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import type { ReactionRemovedEvent } from "@tether/shared";

/**
 * DELETE /api/messages/:messageId/reactions — Remove the current user's reaction.
 *
 * Finds and deletes the user's reaction on the given message.
 * CASCADE on reactionRecipientKeys handles key cleanup automatically.
 * Broadcasts reaction:removed to channel:{channelId} Socket.IO room.
 */
export default async function removeReactionRoute(fastify: FastifyInstance): Promise<void> {
  fastify.delete<{ Params: { messageId: string } }>(
    "/messages/:messageId/reactions",
    {
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

        // Find the user's reaction on this message
        const [reaction] = await db
          .select({ id: messageReactions.id })
          .from(messageReactions)
          .where(
            and(
              eq(messageReactions.messageId, messageId),
              eq(messageReactions.reactorId, userId),
            ),
          )
          .limit(1);

        if (!reaction) {
          return reply.code(404).send({ error: "Reaction not found" });
        }

        // Look up channelId from the message (needed for broadcast)
        const [message] = await db
          .select({ channelId: messages.channelId })
          .from(messages)
          .where(eq(messages.id, messageId))
          .limit(1);

        if (!message) {
          return reply.code(404).send({ error: "Message not found" });
        }

        const { channelId } = message;

        // Delete the reaction (CASCADE removes reactionRecipientKeys automatically)
        await db
          .delete(messageReactions)
          .where(eq(messageReactions.id, reaction.id));

        // Broadcast removal to all channel room members
        const removedEvent: ReactionRemovedEvent = {
          reactionId: reaction.id,
          messageId,
          channelId,
          reactorId: userId,
        };

        fastify.io?.to(`channel:${channelId}`).emit("reaction:removed", removedEvent);

        return reply.code(204).send();
      },
    },
  );
}
