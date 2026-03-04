import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels, serverMembers, messages, messageRecipientKeys, historyRequests, users, attachments, attachmentRecipientKeys } from "../../db/schema.js";
import { eq, and, sql } from "drizzle-orm";

/**
 * GET /api/channels/:channelId/history-keys?requestId=...
 *
 * Returns the granter's own wrapped keys for messages the requester lacks,
 * plus the requester's X25519 public key for re-wrapping.
 * Limited to 100 messages.
 */
export default async function historyKeysRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Params: { channelId: string };
    Querystring: { requestId: string };
  }>("/:channelId/history-keys", {
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
        required: ["requestId"],
        properties: {
          requestId: { type: "string", format: "uuid" },
        },
      },
    },
    handler: async (request, reply) => {
      const granterId = request.user!.id;
      const { channelId } = request.params;
      const { requestId } = request.query;

      // Verify the request exists and is pending
      const [historyReq] = await db
        .select({
          id: historyRequests.id,
          requesterId: historyRequests.requesterId,
          status: historyRequests.status,
        })
        .from(historyRequests)
        .where(
          and(
            eq(historyRequests.id, requestId),
            eq(historyRequests.channelId, channelId),
          ),
        )
        .limit(1);

      if (!historyReq) {
        return reply.code(404).send({ error: "History request not found" });
      }

      if (historyReq.status !== "pending") {
        return reply.code(400).send({ error: "Request is no longer pending" });
      }

      // Verify granter is a member of the server
      const [channel] = await db
        .select({ serverId: channels.serverId })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      if (!channel?.serverId) {
        return reply.code(404).send({ error: "Channel not found" });
      }

      const [membership] = await db
        .select({ id: serverMembers.id })
        .from(serverMembers)
        .where(and(eq(serverMembers.serverId, channel.serverId), eq(serverMembers.userId, granterId)))
        .limit(1);

      if (!membership) {
        return reply.code(403).send({ error: "Not a member of this server" });
      }

      // Get requester's X25519 public key
      const [requester] = await db
        .select({ x25519PublicKey: users.x25519PublicKey })
        .from(users)
        .where(eq(users.id, historyReq.requesterId))
        .limit(1);

      if (!requester?.x25519PublicKey) {
        return reply.code(400).send({ error: "Requester has no public key" });
      }

      // Find messages the requester doesn't have keys for, but the granter does (limit 100)
      const granterKeys = await db
        .select({
          messageId: messageRecipientKeys.messageId,
          encryptedMessageKey: messageRecipientKeys.encryptedMessageKey,
          ephemeralPublicKey: messageRecipientKeys.ephemeralPublicKey,
        })
        .from(messageRecipientKeys)
        .innerJoin(messages, eq(messages.id, messageRecipientKeys.messageId))
        .where(
          and(
            eq(messages.channelId, channelId),
            eq(messageRecipientKeys.recipientUserId, granterId),
            sql`NOT EXISTS (
              SELECT 1 FROM message_recipient_keys mrk2
              WHERE mrk2.message_id = message_recipient_keys.message_id
              AND mrk2.recipient_user_id = ${historyReq.requesterId}
            )`,
          ),
        )
        .limit(100);

      // Get attachment keys for those messages too
      const messageIds = granterKeys.map((k) => k.messageId);
      let granterAttachmentKeys: Array<{
        attachmentId: string;
        encryptedFileKey: Buffer | null;
        ephemeralPublicKey: Buffer | null;
      }> = [];

      if (messageIds.length > 0) {
        granterAttachmentKeys = await db
          .select({
            attachmentId: attachmentRecipientKeys.attachmentId,
            encryptedFileKey: attachmentRecipientKeys.encryptedFileKey,
            ephemeralPublicKey: attachmentRecipientKeys.ephemeralPublicKey,
          })
          .from(attachmentRecipientKeys)
          .innerJoin(attachments, eq(attachments.id, attachmentRecipientKeys.attachmentId))
          .where(
            and(
              sql`${attachments.messageId} IN (${sql.join(messageIds.map((id) => sql`${id}`), sql`, `)})`,
              eq(attachmentRecipientKeys.recipientUserId, granterId),
              sql`NOT EXISTS (
                SELECT 1 FROM attachment_recipient_keys ark2
                WHERE ark2.attachment_id = attachment_recipient_keys.attachment_id
                AND ark2.recipient_user_id = ${historyReq.requesterId}
              )`,
            ),
          );
      }

      return reply.code(200).send({
        requesterId: historyReq.requesterId,
        requesterX25519PublicKey: requester.x25519PublicKey.toString("base64"),
        messageKeys: granterKeys.map((k) => ({
          messageId: k.messageId,
          encryptedMessageKey: k.encryptedMessageKey?.toString("base64") ?? "",
          ephemeralPublicKey: k.ephemeralPublicKey?.toString("base64") ?? "",
        })),
        attachmentKeys: granterAttachmentKeys.map((k) => ({
          attachmentId: k.attachmentId,
          encryptedFileKey: k.encryptedFileKey?.toString("base64") ?? "",
          ephemeralPublicKey: k.ephemeralPublicKey?.toString("base64") ?? "",
        })),
      });
    },
  });
}
