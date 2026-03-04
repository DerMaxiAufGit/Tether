import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { attachments, messages, channels, serverMembers, dmParticipants } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import { getPresignedGetUrl, ATTACHMENTS_BUCKET } from "../../lib/s3.js";

/**
 * GET /api/files/:attachmentId/download — Generate a presigned GET URL for downloading.
 *
 * Verifies the requesting user has access to the channel the attachment belongs to,
 * then returns a presigned GET URL for direct-from-MinIO download.
 */
export default async function presignDownloadRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { attachmentId: string } }>(
    "/:attachmentId/download",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["attachmentId"],
          properties: {
            attachmentId: { type: "string", format: "uuid" },
          },
        },
      },
      handler: async (request, reply) => {
        const userId = request.user!.id;
        const { attachmentId } = request.params;

        // Look up attachment with its message and channel
        const [attachment] = await db
          .select({
            storageKey: attachments.storageKey,
            channelId: messages.channelId,
            channelType: channels.type,
            serverId: channels.serverId,
          })
          .from(attachments)
          .innerJoin(messages, eq(attachments.messageId, messages.id))
          .innerJoin(channels, eq(messages.channelId, channels.id))
          .where(eq(attachments.id, attachmentId))
          .limit(1);

        if (!attachment) {
          return reply.code(404).send({ error: "Attachment not found" });
        }

        // Verify access
        if (attachment.channelType === "dm") {
          const [membership] = await db
            .select({ id: dmParticipants.id })
            .from(dmParticipants)
            .where(and(eq(dmParticipants.channelId, attachment.channelId), eq(dmParticipants.userId, userId)))
            .limit(1);
          if (!membership) {
            return reply.code(403).send({ error: "Not a participant in this DM" });
          }
        } else if (attachment.serverId) {
          const [membership] = await db
            .select({ id: serverMembers.id })
            .from(serverMembers)
            .where(and(eq(serverMembers.serverId, attachment.serverId), eq(serverMembers.userId, userId)))
            .limit(1);
          if (!membership) {
            return reply.code(403).send({ error: "Not a member of this server" });
          }
        }

        const downloadUrl = await getPresignedGetUrl(ATTACHMENTS_BUCKET, attachment.storageKey);
        return reply.code(200).send({ downloadUrl });
      },
    },
  );
}
