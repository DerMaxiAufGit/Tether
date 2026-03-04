import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels, serverMembers, dmParticipants, messages, messageRecipientKeys, users, attachments, attachmentRecipientKeys } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import type { MessageEnvelope, AttachmentEnvelopeData } from "@tether/shared";

interface RecipientKeyInput {
  recipientUserId: string;
  encryptedMessageKey: string; // base64
  ephemeralPublicKey: string; // base64
}

interface AttachmentInput {
  attachmentId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileIv: string;
  isImage: boolean;
  recipients: Array<{
    recipientUserId: string;
    encryptedFileKey: string; // base64
    ephemeralPublicKey: string; // base64
  }>;
}

interface SendMessageBody {
  encryptedContent: string; // base64
  contentIv: string; // base64
  contentAlgorithm?: string;
  epoch?: number;
  recipients: RecipientKeyInput[];
  attachments?: AttachmentInput[];
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
            attachments: {
              type: "array",
              items: {
                type: "object",
                required: ["attachmentId", "storageKey", "fileName", "mimeType", "fileSize", "fileIv", "isImage", "recipients"],
                properties: {
                  attachmentId: { type: "string", format: "uuid" },
                  storageKey: { type: "string" },
                  fileName: { type: "string" },
                  mimeType: { type: "string" },
                  fileSize: { type: "integer" },
                  fileIv: { type: "string" },
                  isImage: { type: "boolean" },
                  recipients: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      required: ["recipientUserId", "encryptedFileKey", "ephemeralPublicKey"],
                      properties: {
                        recipientUserId: { type: "string", format: "uuid" },
                        encryptedFileKey: { type: "string" },
                        ephemeralPublicKey: { type: "string" },
                      },
                    },
                  },
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

        if (channel.type !== "text" && channel.type !== "dm") {
          return reply.code(400).send({ error: "Messages can only be sent to text or DM channels" });
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

          // Insert attachment records + recipient keys if present
          if (request.body.attachments?.length) {
            for (const att of request.body.attachments) {
              const [insertedAtt] = await tx
                .insert(attachments)
                .values({
                  id: att.attachmentId,
                  messageId: inserted.id,
                  uploaderId: userId,
                  storageKey: att.storageKey,
                  fileName: att.fileName,
                  mimeType: att.mimeType,
                  fileSize: att.fileSize,
                  fileIv: att.fileIv,
                  isImage: att.isImage ? 1 : 0,
                })
                .returning();

              const attKeyRows = att.recipients.map((r) => ({
                attachmentId: insertedAtt.id,
                recipientUserId: r.recipientUserId,
                encryptedFileKey: Buffer.from(r.encryptedFileKey, "base64"),
                ephemeralPublicKey: Buffer.from(r.ephemeralPublicKey, "base64"),
              }));

              await tx.insert(attachmentRecipientKeys).values(attKeyRows);
            }
          }

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

        // Query attachments for this message (if any)
        const messageAttachments = await db
          .select()
          .from(attachments)
          .where(eq(attachments.messageId, message.id));

        // For REST response: get sender's recipient key for each attachment
        const attachmentData = await Promise.all(
          messageAttachments.map(async (att) => {
            const [senderAttKey] = await db
              .select({
                encryptedFileKey: attachmentRecipientKeys.encryptedFileKey,
                ephemeralPublicKey: attachmentRecipientKeys.ephemeralPublicKey,
              })
              .from(attachmentRecipientKeys)
              .where(
                and(
                  eq(attachmentRecipientKeys.attachmentId, att.id),
                  eq(attachmentRecipientKeys.recipientUserId, userId),
                ),
              )
              .limit(1);

            return {
              id: att.id,
              fileName: att.fileName,
              mimeType: att.mimeType,
              fileSize: att.fileSize,
              isImage: !!att.isImage,
              fileIv: att.fileIv,
              recipientKey: senderAttKey
                ? {
                    encryptedFileKey: senderAttKey.encryptedFileKey?.toString("base64") ?? "",
                    ephemeralPublicKey: senderAttKey.ephemeralPublicKey?.toString("base64") ?? "",
                  }
                : null,
            };
          }),
        );

        // For Socket.IO broadcast: get ALL recipient keys for each attachment
        const attachmentEnvelopeData: AttachmentEnvelopeData[] = await Promise.all(
          messageAttachments.map(async (att) => {
            const allAttKeys = await db
              .select({
                recipientUserId: attachmentRecipientKeys.recipientUserId,
                encryptedFileKey: attachmentRecipientKeys.encryptedFileKey,
                ephemeralPublicKey: attachmentRecipientKeys.ephemeralPublicKey,
              })
              .from(attachmentRecipientKeys)
              .where(eq(attachmentRecipientKeys.attachmentId, att.id));

            return {
              id: att.id,
              fileName: att.fileName,
              mimeType: att.mimeType,
              fileSize: att.fileSize,
              isImage: !!att.isImage,
              fileIv: att.fileIv,
              recipientKeys: allAttKeys.map((k) => ({
                recipientUserId: k.recipientUserId,
                encryptedFileKey: k.encryptedFileKey?.toString("base64") ?? "",
                ephemeralPublicKey: k.ephemeralPublicKey?.toString("base64") ?? "",
              })),
            };
          }),
        );

        // Build the REST response envelope (MessageResponse shape — sender's key only)
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
          attachments: attachmentData,
        };

        // Query ALL recipient keys for the Socket.IO broadcast envelope
        const allKeys = await db
          .select({
            recipientUserId: messageRecipientKeys.recipientUserId,
            encryptedMessageKey: messageRecipientKeys.encryptedMessageKey,
            ephemeralPublicKey: messageRecipientKeys.ephemeralPublicKey,
          })
          .from(messageRecipientKeys)
          .where(eq(messageRecipientKeys.messageId, message.id));

        // Build broadcast envelope matching the MessageEnvelope interface exactly
        const broadcastEnvelope: MessageEnvelope = {
          messageId: message.id,
          channelId: message.channelId,
          senderId: message.senderId,
          senderDisplayName: sender?.displayName ?? "",
          senderAvatarUrl: sender?.avatarUrl ?? null,
          encryptedContent: message.encryptedContent?.toString("base64") ?? "",
          contentIv: message.contentIv?.toString("base64") ?? "",
          contentAlgorithm: message.contentAlgorithm,
          epoch: message.epoch,
          createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : String(message.createdAt),
          recipientKeys: allKeys.map((k) => ({
            recipientUserId: k.recipientUserId,
            encryptedMessageKey: k.encryptedMessageKey?.toString("base64") ?? "",
            ephemeralPublicKey: k.ephemeralPublicKey?.toString("base64") ?? "",
          })),
          attachments: attachmentEnvelopeData,
        };

        // Broadcast to all channel room members (client deduplicates via optimistic ID)
        const room = fastify.io?.sockets.adapter.rooms.get(`channel:${channelId}`);
        request.log.info(
          { channelId, messageId: message.id, roomSize: room?.size ?? 0 },
          "[broadcast] message:created → channel room"
        );
        fastify.io?.to(`channel:${channelId}`).emit("message:created", broadcastEnvelope);

        return reply.code(201).send({ message: envelope });
      },
    },
  );
}
