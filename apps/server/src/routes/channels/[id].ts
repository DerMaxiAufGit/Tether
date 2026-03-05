import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels } from "../../db/schema.js";
import { eq, asc, sql } from "drizzle-orm";
import { PERMISSIONS } from "@tether/shared";
import { requirePermission } from "../../lib/permissions.js";

interface UpdateChannelBody {
  name?: string;
  topic?: string | null;
}

/**
 * PATCH  /api/channels/:id — Update channel name/topic (owner-only).
 * DELETE /api/channels/:id — Delete channel and compact positions (owner-only).
 *
 * Both operations verify server membership and owner status.
 * All mutations broadcast to the server:{serverId} Socket.IO room.
 */
export default async function channelByIdRoute(fastify: FastifyInstance): Promise<void> {
  // PATCH /api/channels/:id
  fastify.patch<{ Params: { id: string }; Body: UpdateChannelBody }>("/:id", {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", format: "uuid" },
        },
      },
      body: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
          topic: { type: ["string", "null"] },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { id: channelId } = request.params;
      const { name, topic } = request.body;

      // Look up channel to get its serverId
      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      if (!channel) {
        return reply.code(404).send({ error: "Channel not found" });
      }

      const { serverId } = channel;

      // DM channels cannot be edited via this route
      if (!serverId) {
        return reply.code(400).send({ error: "DM channels cannot be edited" });
      }

      // Require MANAGE_CHANNELS permission
      const auth = await requirePermission(userId, serverId, PERMISSIONS.MANAGE_CHANNELS);
      if (!auth) {
        return reply.code(403).send({ error: "Missing MANAGE_CHANNELS permission" });
      }

      const updateValues: { name?: string; topic?: string | null; updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (name !== undefined) updateValues.name = name;
      if (topic !== undefined) updateValues.topic = topic;

      const [updated] = await db
        .update(channels)
        .set(updateValues)
        .where(eq(channels.id, channelId))
        .returning();

      // Broadcast to all server members
      fastify.io
        ?.to(`server:${serverId}`)
        .emit("channel:updated", { serverId, channel: updated });

      return reply.code(200).send({ channel: updated });
    },
  });

  // DELETE /api/channels/:id
  fastify.delete<{ Params: { id: string } }>("/:id", {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", format: "uuid" },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { id: channelId } = request.params;

      // Look up channel to get its serverId
      const [channel] = await db
        .select({ id: channels.id, serverId: channels.serverId })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      if (!channel) {
        return reply.code(404).send({ error: "Channel not found" });
      }

      const { serverId } = channel;

      // DM channels cannot be deleted via this route
      if (!serverId) {
        return reply.code(400).send({ error: "DM channels cannot be deleted via this endpoint" });
      }

      // Require MANAGE_CHANNELS permission
      const auth = await requirePermission(userId, serverId, PERMISSIONS.MANAGE_CHANNELS);
      if (!auth) {
        return reply.code(403).send({ error: "Missing MANAGE_CHANNELS permission" });
      }

      // Delete and compact positions in a single transaction
      await db.transaction(async (tx) => {
        // Delete the channel first (cascade removes messages, overrides, etc.)
        await tx.delete(channels).where(eq(channels.id, channelId));

        // Compact remaining positions: re-number 0, 1, 2... to close the gap
        const remaining = await tx
          .select({ id: channels.id })
          .from(channels)
          .where(eq(channels.serverId, serverId))
          .orderBy(asc(channels.position));

        if (remaining.length > 0) {
          const cases = remaining.map((ch, i) =>
            sql`WHEN ${channels.id} = ${ch.id} THEN ${i}`,
          );
          await tx
            .update(channels)
            .set({ position: sql`CASE ${sql.join(cases, sql` `)} END` })
            .where(eq(channels.serverId, serverId));
        }
      });

      // Broadcast to all server members
      fastify.io
        ?.to(`server:${serverId}`)
        .emit("channel:deleted", { serverId, channelId });

      return reply.code(200).send({ ok: true });
    },
  });
}
