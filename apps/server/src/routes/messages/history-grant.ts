import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels, serverMembers, historyRequests, messageRecipientKeys, attachmentRecipientKeys } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import type { HistoryGrantedEvent } from "@tether/shared";

interface GrantBody {
  requestId: string;
  messageKeys: Array<{
    messageId: string;
    encryptedMessageKey: string; // base64
    ephemeralPublicKey: string;  // base64
  }>;
  attachmentKeys: Array<{
    attachmentId: string;
    encryptedFileKey: string;   // base64
    ephemeralPublicKey: string;  // base64
  }>;
}

/**
 * POST /api/channels/:channelId/history-grant
 *
 * Accepts re-wrapped keys from granter's client, inserts them as new
 * recipient key rows, and updates the request status to "granted".
 */
export default async function historyGrantRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{
    Params: { channelId: string };
    Body: GrantBody;
  }>("/:channelId/history-grant", {
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
      const granterId = request.user!.id;
      const { channelId } = request.params;
      const { requestId, messageKeys, attachmentKeys } = request.body;

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

      // Verify granter is a server member
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

      // Batch insert message recipient keys for the requester
      if (messageKeys.length > 0) {
        await db.insert(messageRecipientKeys).values(
          messageKeys.map((k) => ({
            messageId: k.messageId,
            recipientUserId: historyReq.requesterId,
            encryptedMessageKey: Buffer.from(k.encryptedMessageKey, "base64"),
            ephemeralPublicKey: Buffer.from(k.ephemeralPublicKey, "base64"),
          })),
        ).onConflictDoNothing();
      }

      // Batch insert attachment recipient keys for the requester
      if (attachmentKeys.length > 0) {
        await db.insert(attachmentRecipientKeys).values(
          attachmentKeys.map((k) => ({
            attachmentId: k.attachmentId,
            recipientUserId: historyReq.requesterId,
            encryptedFileKey: Buffer.from(k.encryptedFileKey, "base64"),
            ephemeralPublicKey: Buffer.from(k.ephemeralPublicKey, "base64"),
          })),
        ).onConflictDoNothing();
      }

      // Update request status to granted
      await db
        .update(historyRequests)
        .set({
          status: "granted",
          granterId,
          grantedAt: new Date(),
        })
        .where(eq(historyRequests.id, requestId));

      // Emit to requester's user room
      if (fastify.io) {
        const event: HistoryGrantedEvent = {
          requestId,
          channelId,
          granterId,
          keysGranted: messageKeys.length,
        };
        fastify.io.to(`user:${historyReq.requesterId}`).emit("history:granted", event);
      }

      return reply.code(200).send({ granted: true, keysGranted: messageKeys.length });
    },
  });
}
