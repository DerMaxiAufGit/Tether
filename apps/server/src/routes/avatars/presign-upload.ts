import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { getPresignedPutUrl, AVATARS_BUCKET } from "../../lib/s3.js";
import { MAX_AVATAR_SIZE } from "@tether/shared";

interface PresignAvatarBody {
  mimeType: string;
  fileSize: number;
}

/**
 * POST /api/avatars/presign-upload — Generate a presigned PUT URL for avatar upload.
 *
 * Avatars are public (unencrypted) since they display to all users.
 * Stored in the 'avatars' bucket keyed by userId.
 */
export default async function presignAvatarUploadRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: PresignAvatarBody }>(
    "/presign-upload",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["mimeType", "fileSize"],
          properties: {
            mimeType: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
            fileSize: { type: "integer", minimum: 1, maximum: MAX_AVATAR_SIZE },
          },
        },
      },
      handler: async (request, reply) => {
        const userId = request.user!.id;

        // Key format: userId/avatar-{uuid}.{ext} — allows overwriting
        const ext = request.body.mimeType.split("/")[1] || "png";
        const storageKey = `${userId}/avatar-${randomUUID()}.${ext}`;

        const uploadUrl = await getPresignedPutUrl(
          AVATARS_BUCKET,
          storageKey,
          request.body.mimeType,
        );

        // The avatarUrl is the nginx proxy path to the avatar
        const avatarUrl = `/storage/${AVATARS_BUCKET}/${storageKey}`;

        return reply.code(200).send({ uploadUrl, avatarUrl, storageKey });
      },
    },
  );
}
