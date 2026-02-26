import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels, serverMembers, messages, messageRecipientKeys, users } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

interface RecipientKeyInput {
  recipientUserId: string;
  encryptedMessageKey: string; // base64
  ephemeralPublicKey: string; // base64
}

interface SendMessageBody {
  encryptedContent: string; // base64
  contentIv: string; // base64
  contentAlgorithm?: string;
  epoch?: number;
  recipients: RecipientKeyInput[];
}

/**
 * POST /api/channels/:channelId/messages — Send a new encrypted message to a channel.
 *
 * Stores ciphertext + per-recipient wrapped keys in a transaction.
 * After commit, broadcasts message:created to the channel:{channelId} Socket.IO room.
 * All bytea fields cross the API boundary as base64 strings.
 */
export default async function createMessageRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { channelId: string }; Body: SendMessageBody }>(
    "/:channelId/messages",
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
        body: {
          type: "object",
          required: ["encryptedContent", "contentIv", "recipients"],
          properties: {
            encryptedContent: { type: "string" },
            contentIv: { type: "string" },
            contentAlgorithm: { type: "string", default: "aes-256-gcm" },
            epoch: { type: "integer", default: 1 },
            recipients: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["recipientUserId", "encryptedMessageKey", "ephemeralPublicKey"],
                properties: {
                  recipientUserId: { type: "string", format: "uuid" },
                  encryptedMessageKey: { type: "string" },
                  ephemeralPublicKey: { type: "string" },
                },
              },
            },
          },
        },
      },
      handler: async (request, reply) => {
        const userId = request.user!.id;
        const { channelId } = request.params;
        const {
          encryptedContent,
          contentIv,
          contentAlgorithm = "aes-256-gcm",
          epoch = 1,
          recipients,
        } = request.body;

        // Look up channel and verify it is a text channel
        const [channel] = await db
          .select({ id: channels.id, serverId: channels.serverId, type: channels.type })
          .from(channels)
          .where(eq(channels.id, channelId))
          .limit(1);

        if (!channel) {
          return reply.code(404).send({ error: "Channel not found" });
        }

        if (channel.type !== "text") {
          return reply.code(400).send({ error: "Messages can only be sent to text channels" });
        }

        // Verify the authenticated user is a member of the owning server
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

        // Decode base64 inputs to Buffers for bytea storage
        const encryptedContentBuf = Buffer.from(encryptedContent, "base64");
        const contentIvBuf = Buffer.from(contentIv, "base64");

        // Insert message + recipient keys in a single transaction
        const message = await db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(messages)
            .values({
              channelId,
              senderId: userId,
              encryptedContent: encryptedContentBuf,
              contentIv: contentIvBuf,
              contentAlgorithm,
              epoch,
            })
            .returning();

          const recipientRows = recipients.map((r) => ({
            messageId: inserted.id,
            recipientUserId: r.recipientUserId,
            encryptedMessageKey: Buffer.from(r.encryptedMessageKey, "base64"),
            ephemeralPublicKey: Buffer.from(r.ephemeralPublicKey, "base64"),
          }));

          await tx.insert(messageRecipientKeys).values(recipientRows);

          return inserted;
        });

        // Look up sender info for the response
        const [sender] = await db
          .select({ displayName: users.displayName, avatarUrl: users.avatarUrl })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        // Look up the sender's own recipient key for the response
        const [senderKey] = await db
          .select({
            encryptedMessageKey: messageRecipientKeys.encryptedMessageKey,
            ephemeralPublicKey: messageRecipientKeys.ephemeralPublicKey,
          })
          .from(messageRecipientKeys)
          .where(
            and(
              eq(messageRecipientKeys.messageId, message.id),
              eq(messageRecipientKeys.recipientUserId, userId),
            ),
          )
          .limit(1);

        // Build the MessageEnvelope for broadcast and response (all bytes as base64)
        const envelope = {
          id: message.id,
          channelId: message.channelId,
          senderId: message.senderId,
          senderDisplayName: sender?.displayName ?? null,
          senderAvatarUrl: sender?.avatarUrl ?? null,
          encryptedContent: message.encryptedContent?.toString("base64") ?? null,
          contentIv: message.contentIv?.toString("base64") ?? null,
          contentAlgorithm: message.contentAlgorithm,
          epoch: message.epoch,
          createdAt: message.createdAt,
          editedAt: message.editedAt ?? null,
          recipientKey: senderKey
            ? {
                encryptedMessageKey: senderKey.encryptedMessageKey?.toString("base64") ?? null,
                ephemeralPublicKey: senderKey.ephemeralPublicKey?.toString("base64") ?? null,
              }
            : null,
        };

        // Broadcast to all channel room members (client deduplicates via optimistic ID)
        fastify.io.to(`channel:${channelId}`).emit("message:created", envelope);

        return reply.code(201).send({ message: envelope });
      },
    },
  );
}
