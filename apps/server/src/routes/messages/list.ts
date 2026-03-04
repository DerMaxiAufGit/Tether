import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels, serverMembers, dmParticipants, messages, messageRecipientKeys, users, attachments, attachmentRecipientKeys } from "../../db/schema.js";
import { eq, and, lt, desc } from "drizzle-orm";

/**
 * GET /api/channels/:channelId/messages — Cursor-paginated message list.
 *
 * Returns messages in descending createdAt order (newest first).
 * Each message includes the requesting user's recipient key (their wrapped copy of the AES key).
 * Query params:
 *   - before  (optional): message ID cursor — return only messages older than this one
 *   - limit   (optional): max results (default 50, max 100)
 *
 * All bytea fields are returned as base64 strings.
 */
export default async function listMessagesRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Params: { channelId: string };
    Querystring: { before?: string; limit?: string };
  }>("/:channelId/messages", {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: "object",
        required: ["channelId"],
        properties: {
          channelId: { type: "string", format: "uuid" },
        },
      },
      querystring: {
        type: "object",
        properties: {
          before: { type: "string", format: "uuid" },
          limit: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { channelId } = request.params;
      const { before, limit: limitStr } = request.query;

      const limit = Math.min(parseInt(limitStr ?? "50", 10) || 50, 100);

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
        return reply.code(400).send({ error: "Messages can only be listed for text or DM channels" });
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

      // Resolve cursor: if `before` is provided, look up its createdAt timestamp
      let cursorDate: Date | undefined;
      if (before) {
        const [cursorMsg] = await db
          .select({ createdAt: messages.createdAt })
          .from(messages)
          .where(eq(messages.id, before))
          .limit(1);

        if (!cursorMsg) {
          return reply.code(404).send({ error: "Cursor message not found" });
        }
        cursorDate = cursorMsg.createdAt;
      }

      // Build WHERE conditions
      const conditions = [eq(messages.channelId, channelId)];
      if (cursorDate) {
        conditions.push(lt(messages.createdAt, cursorDate));
      }

      // Fetch messages with sender info and the current user's recipient key
      const rows = await db
        .select({
          // Message fields
          id: messages.id,
          channelId: messages.channelId,
          senderId: messages.senderId,
          encryptedContent: messages.encryptedContent,
          contentIv: messages.contentIv,
          contentAlgorithm: messages.contentAlgorithm,
          epoch: messages.epoch,
          createdAt: messages.createdAt,
          editedAt: messages.editedAt,
          // Sender info
          senderDisplayName: users.displayName,
          senderAvatarUrl: users.avatarUrl,
          // Recipient key for the requesting user
          recipientEncryptedMessageKey: messageRecipientKeys.encryptedMessageKey,
          recipientEphemeralPublicKey: messageRecipientKeys.ephemeralPublicKey,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .leftJoin(
          messageRecipientKeys,
          and(
            eq(messageRecipientKeys.messageId, messages.id),
            eq(messageRecipientKeys.recipientUserId, userId),
          ),
        )
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt))
        .limit(limit);

      // Shape the response: encode bytea fields as base64, include attachments
      const messageList = await Promise.all(
        rows.map(async (row) => {
          // Query attachments for this message
          const messageAttachments = await db
            .select()
            .from(attachments)
            .where(eq(attachments.messageId, row.id));

          const attachmentData = await Promise.all(
            messageAttachments.map(async (att) => {
              const [userAttKey] = await db
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

              // If no recipientKey, return minimal stub to avoid metadata leakage
              if (!userAttKey) {
                return { id: att.id, recipientKey: null };
              }

              return {
                id: att.id,
                fileName: att.fileName,
                mimeType: att.mimeType,
                fileSize: att.fileSize,
                isImage: !!att.isImage,
                fileIv: att.fileIv,
                recipientKey: {
                  encryptedFileKey: userAttKey.encryptedFileKey?.toString("base64") ?? "",
                  ephemeralPublicKey: userAttKey.ephemeralPublicKey?.toString("base64") ?? "",
                },
              };
            }),
          );

          return {
            id: row.id,
            channelId: row.channelId,
            senderId: row.senderId,
            senderDisplayName: row.senderDisplayName,
            senderAvatarUrl: row.senderAvatarUrl,
            encryptedContent: row.encryptedContent?.toString("base64") ?? null,
            contentIv: row.contentIv?.toString("base64") ?? null,
            contentAlgorithm: row.contentAlgorithm,
            epoch: row.epoch,
            createdAt: row.createdAt,
            editedAt: row.editedAt ?? null,
            recipientKey:
              row.recipientEncryptedMessageKey && row.recipientEphemeralPublicKey
                ? {
                    encryptedMessageKey: row.recipientEncryptedMessageKey.toString("base64"),
                    ephemeralPublicKey: row.recipientEphemeralPublicKey.toString("base64"),
                  }
                : null,
            attachments: attachmentData,
          };
        }),
      );

      return reply.code(200).send({ messages: messageList });
    },
  });
}
