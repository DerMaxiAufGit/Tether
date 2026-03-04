import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { db } from "../../db/client.js";
import { channels, serverMembers, dmParticipants } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import { getPresignedPutUrl, ATTACHMENTS_BUCKET } from "../../lib/s3.js";
import { MAX_FILE_SIZE } from "@tether/shared";

interface PresignUploadBody {
  fileName: string;
  mimeType: string;
  fileSize: number;
  channelId: string;
}

/**
 * POST /api/files/presign-upload — Generate a presigned PUT URL for direct-to-MinIO upload.
 *
 * The server validates membership and file size, generates a presigned URL,
 * and returns it with a pre-generated attachmentId. The client uploads
 * encrypted bytes directly to MinIO via the presigned URL.
 */
export default async function presignUploadRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: PresignUploadBody }>(
    "/presign-upload",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["fileName", "mimeType", "fileSize", "channelId"],
          properties: {
            fileName: { type: "string", minLength: 1, maxLength: 255 },
            mimeType: { type: "string", minLength: 1, maxLength: 127 },
            fileSize: { type: "integer", minimum: 1, maximum: MAX_FILE_SIZE },
            channelId: { type: "string", format: "uuid" },
          },
        },
      },
      handler: async (request, reply) => {
        const userId = request.user!.id;
        const { fileName, mimeType, fileSize, channelId } = request.body;

        // Verify channel exists
        const [channel] = await db
          .select({ id: channels.id, serverId: channels.serverId, type: channels.type })
          .from(channels)
          .where(eq(channels.id, channelId))
          .limit(1);

        if (!channel) {
          return reply.code(404).send({ error: "Channel not found" });
        }

        // Verify user has access to the channel
        if (channel.type === "dm") {
          const [membership] = await db
            .select({ id: dmParticipants.id })
            .from(dmParticipants)
            .where(and(eq(dmParticipants.channelId, channelId), eq(dmParticipants.userId, userId)))
            .limit(1);
          if (!membership) {
            return reply.code(403).send({ error: "Not a participant in this DM" });
          }
        } else if (channel.serverId) {
          const [membership] = await db
            .select({ id: serverMembers.id })
            .from(serverMembers)
            .where(and(eq(serverMembers.serverId, channel.serverId), eq(serverMembers.userId, userId)))
            .limit(1);
          if (!membership) {
            return reply.code(403).send({ error: "Not a member of this server" });
          }
        }

        // Generate unique storage key and attachment ID
        const attachmentId = randomUUID();
        const storageKey = `${channelId}/${attachmentId}/${fileName}`;

        // Generate presigned PUT URL
        const uploadUrl = await getPresignedPutUrl(
          ATTACHMENTS_BUCKET,
          storageKey,
          "application/octet-stream", // always octet-stream since content is encrypted
        );

        return reply.code(200).send({
          uploadUrl,
          attachmentId,
          storageKey,
        });
      },
    },
  );
}
