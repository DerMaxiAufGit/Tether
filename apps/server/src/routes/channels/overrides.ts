import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels, channelOverrides, roles } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import {
  PERMISSIONS,
  type ChannelOverrideResponse,
  type UpsertChannelOverrideRequest,
} from "@tether/shared";
import { requirePermission } from "../../lib/permissions.js";

/**
 * GET    /api/channels/:id/overrides          — list overrides (member)
 * PUT    /api/channels/:id/overrides/:roleId  — upsert override (MANAGE_CHANNELS)
 * DELETE /api/channels/:id/overrides/:roleId  — remove override (MANAGE_CHANNELS)
 */
export default async function channelOverridesRoute(fastify: FastifyInstance): Promise<void> {
  // GET /api/channels/:id/overrides
  fastify.get<{ Params: { id: string } }>("/:id/overrides", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { id: channelId } = request.params;

      const [channel] = await db
        .select({ serverId: channels.serverId })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      if (!channel?.serverId) return reply.code(404).send({ error: "Channel not found" });

      // Just need to be a member (VIEW_CHANNELS)
      const auth = await requirePermission(userId, channel.serverId, PERMISSIONS.VIEW_CHANNELS);
      if (!auth) return reply.code(404).send({ error: "Channel not found" });

      const rows = await db
        .select({
          id: channelOverrides.id,
          channelId: channelOverrides.channelId,
          roleId: channelOverrides.roleId,
          allow: channelOverrides.allow,
          deny: channelOverrides.deny,
          roleName: roles.name,
          roleColor: roles.color,
        })
        .from(channelOverrides)
        .innerJoin(roles, eq(roles.id, channelOverrides.roleId))
        .where(eq(channelOverrides.channelId, channelId));

      const result: ChannelOverrideResponse[] = rows.map((r) => ({
        id: r.id,
        channelId: r.channelId,
        roleId: r.roleId,
        allow: r.allow,
        deny: r.deny,
        roleName: r.roleName,
        roleColor: r.roleColor,
      }));

      return reply.code(200).send({ overrides: result });
    },
  });

  // PUT /api/channels/:id/overrides/:roleId
  fastify.put<{
    Params: { id: string; roleId: string };
    Body: UpsertChannelOverrideRequest;
  }>("/:id/overrides/:roleId", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["allow", "deny"],
        properties: {
          allow: { type: "string" },
          deny: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { id: channelId, roleId } = request.params;
      const { allow, deny } = request.body;

      const [channel] = await db
        .select({ serverId: channels.serverId })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      if (!channel?.serverId) return reply.code(404).send({ error: "Channel not found" });

      const auth = await requirePermission(userId, channel.serverId, PERMISSIONS.MANAGE_CHANNELS);
      if (!auth) return reply.code(403).send({ error: "Missing MANAGE_CHANNELS permission" });

      // Validate role belongs to this server
      const [role] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.id, roleId), eq(roles.serverId, channel.serverId)))
        .limit(1);

      if (!role) return reply.code(404).send({ error: "Role not found" });

      // Upsert
      const [existing] = await db
        .select({ id: channelOverrides.id })
        .from(channelOverrides)
        .where(
          and(eq(channelOverrides.channelId, channelId), eq(channelOverrides.roleId, roleId)),
        )
        .limit(1);

      if (existing) {
        await db
          .update(channelOverrides)
          .set({ allow, deny })
          .where(eq(channelOverrides.id, existing.id));
      } else {
        await db.insert(channelOverrides).values({
          channelId,
          roleId,
          allow,
          deny,
        });
      }

      return reply.code(200).send({ ok: true });
    },
  });

  // DELETE /api/channels/:id/overrides/:roleId
  fastify.delete<{ Params: { id: string; roleId: string } }>("/:id/overrides/:roleId", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { id: channelId, roleId } = request.params;

      const [channel] = await db
        .select({ serverId: channels.serverId })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      if (!channel?.serverId) return reply.code(404).send({ error: "Channel not found" });

      const auth = await requirePermission(userId, channel.serverId, PERMISSIONS.MANAGE_CHANNELS);
      if (!auth) return reply.code(403).send({ error: "Missing MANAGE_CHANNELS permission" });

      await db
        .delete(channelOverrides)
        .where(
          and(eq(channelOverrides.channelId, channelId), eq(channelOverrides.roleId, roleId)),
        );

      return reply.code(200).send({ ok: true });
    },
  });
}
