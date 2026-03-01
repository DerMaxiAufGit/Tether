import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import {
  channels,
  serverMembers,
  dmParticipants,
  messages,
  messageReactions,
  reactionRecipientKeys,
} from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import type { AddReactionRequest, ReactionEnvelope } from "@tether/shared";

/**
 * POST /api/messages/:messageId/reactions — Add an encrypted emoji reaction.
 *
 * Stores encrypted reaction ciphertext + per-recipient wrapped keys.
 * Server never sees the emoji plaintext (zero-knowledge).
 * After insert, broadcasts reaction:added to channel:{channelId} Socket.IO room.
 */
export default async function addReactionRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { messageId: string }; Body: AddReactionRequest }>(
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
        body: {
          type: "object",
          required: ["encryptedReaction", "reactionIv", "recipients"],
          properties: {
            encryptedReaction: { type: "string" },
            reactionIv: { type: "string" },
            recipients: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["recipientUserId", "encryptedReactionKey", "ephemeralPublicKey"],
                properties: {
                  recipientUserId: { type: "string", format: "uuid" },
                  encryptedReactionKey: { type: "string" },
                  ephemeralPublicKey: { type: "string" },
                },
              },
            },
          },
        },
      },
      handler: async (request, reply) => {
        const userId = request.user!.id;
        const { messageId } = request.params;
        const { encryptedReaction, reactionIv, recipients } = request.body;

        // Look up message + channel info
        const [message] = await db
          .select({
            id: messages.id,
            channelId: messages.channelId,
          })
          .from(messages)
          .where(eq(messages.id, messageId))
          .limit(1);

        if (!message) {
          return reply.code(404).send({ error: "Message not found" });
        }

        const { channelId } = message;

        // Look up channel to verify access
        const [channel] = await db
          .select({ id: channels.id, serverId: channels.serverId, type: channels.type })
          .from(channels)
          .where(eq(channels.id, channelId))
          .limit(1);

        if (!channel) {
          return reply.code(404).send({ error: "Channel not found" });
        }

        // Verify access: DM channels check dmParticipants; server channels check serverMembers
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
        } else {
          const [membership] = await db
            .select({ id: serverMembers.id })
            .from(serverMembers)
            .where(
              and(eq(serverMembers.serverId, channel.serverId!), eq(serverMembers.userId, userId)),
            )
            .limit(1);

          if (!membership) {
            return reply.code(403).send({ error: "You are not a member of this server" });
          }
        }

        // Check for existing reaction by this user on this message (returns 409 before hitting UNIQUE)
        const [existing] = await db
          .select({ id: messageReactions.id })
          .from(messageReactions)
          .where(
            and(eq(messageReactions.messageId, messageId), eq(messageReactions.reactorId, userId)),
          )
          .limit(1);

        if (existing) {
          return reply.code(409).send({ error: "You have already reacted to this message" });
        }

        // Decode base64 inputs to Buffers for bytea storage
        const encryptedReactionBuf = Buffer.from(encryptedReaction, "base64");
        const reactionIvBuf = Buffer.from(reactionIv, "base64");

        // Insert reaction + recipient keys in a transaction
        const reaction = await db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(messageReactions)
            .values({
              messageId,
              reactorId: userId,
              encryptedReaction: encryptedReactionBuf,
              reactionIv: reactionIvBuf,
              reactionAlgorithm: "aes-256-gcm",
            })
            .returning();

          const keyRows = recipients.map((r) => ({
            reactionId: inserted.id,
            recipientUserId: r.recipientUserId,
            encryptedReactionKey: Buffer.from(r.encryptedReactionKey, "base64"),
            ephemeralPublicKey: Buffer.from(r.ephemeralPublicKey, "base64"),
          }));

          await tx.insert(reactionRecipientKeys).values(keyRows);

          return inserted;
        });

        // Build broadcast envelope with all recipient keys
        const broadcastEnvelope: ReactionEnvelope = {
          reactionId: reaction.id,
          messageId,
          channelId,
          reactorId: userId,
          encryptedReaction: reaction.encryptedReaction?.toString("base64") ?? "",
          reactionIv: reaction.reactionIv?.toString("base64") ?? "",
          reactionAlgorithm: reaction.reactionAlgorithm,
          createdAt: reaction.createdAt instanceof Date
            ? reaction.createdAt.toISOString()
            : String(reaction.createdAt),
          recipientKeys: recipients,
        };

        // Broadcast to all channel room members
        fastify.io.to(`channel:${channelId}`).emit("reaction:added", broadcastEnvelope);

        return reply.code(201).send({
          id: reaction.id,
          messageId,
          reactorId: userId,
          encryptedReaction: reaction.encryptedReaction?.toString("base64") ?? "",
          reactionIv: reaction.reactionIv?.toString("base64") ?? "",
          reactionAlgorithm: reaction.reactionAlgorithm,
          createdAt: broadcastEnvelope.createdAt,
          recipientKey: null,
        });
      },
    },
  );
}
