import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { eq } from "drizzle-orm";

interface UpdateAvatarBody {
  avatarUrl: string;
}

/**
 * PUT /api/avatars/update — Update the user's avatarUrl after successful upload.
 */
export default async function updateAvatarRoute(fastify: FastifyInstance): Promise<void> {
  fastify.put<{ Body: UpdateAvatarBody }>(
    "/update",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["avatarUrl"],
          properties: {
            avatarUrl: { type: "string", maxLength: 500 },
          },
        },
      },
      handler: async (request, reply) => {
        const userId = request.user!.id;
        const { avatarUrl } = request.body;

        // Validate the URL starts with the expected prefix
        if (!avatarUrl.startsWith("/storage/avatars/")) {
          return reply.code(400).send({ error: "Invalid avatar URL" });
        }

        await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));

        return reply.code(200).send({ avatarUrl });
      },
    },
  );
}
