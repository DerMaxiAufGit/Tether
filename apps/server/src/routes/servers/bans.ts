import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { bans, serverMembers, servers, users } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import { PERMISSIONS, type BanResponse, type CreateBanRequest } from "@tether/shared";
import { requirePermission } from "../../lib/permissions.js";

/**
 * GET    /api/servers/:id/bans          — list bans (BAN_MEMBERS)
 * POST   /api/servers/:id/bans          — ban a user (BAN_MEMBERS)
 * DELETE /api/servers/:id/bans/:userId  — unban a user (BAN_MEMBERS)
 */
export default async function serverBansRoute(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /:id/bans — list all bans
  // -------------------------------------------------------------------------
  fastify.get<{ Params: { id: string } }>("/:id/bans", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { id: serverId } = request.params;

      const auth = await requirePermission(userId, serverId, PERMISSIONS.BAN_MEMBERS);
      if (!auth) return reply.code(403).send({ error: "Missing BAN_MEMBERS permission" });

      const rows = await db
        .select({
          id: bans.id,
          serverId: bans.serverId,
          userId: bans.userId,
          bannedBy: bans.bannedBy,
          reason: bans.reason,
          createdAt: bans.createdAt,
          userDisplayName: users.displayName,
          userAvatarUrl: users.avatarUrl,
        })
        .from(bans)
        .innerJoin(users, eq(users.id, bans.userId))
        .where(eq(bans.serverId, serverId));

      const result: BanResponse[] = rows.map((r) => ({
        id: r.id,
        serverId: r.serverId,
        userId: r.userId,
        bannedBy: r.bannedBy,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
        user: {
          id: r.userId,
          displayName: r.userDisplayName,
          avatarUrl: r.userAvatarUrl,
        },
      }));

      return reply.code(200).send({ bans: result });
    },
  });

  // -------------------------------------------------------------------------
  // POST /:id/bans — ban a user
  // -------------------------------------------------------------------------
  fastify.post<{ Params: { id: string }; Body: CreateBanRequest }>("/:id/bans", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["userId"],
        properties: {
          userId: { type: "string", format: "uuid" },
          reason: { type: "string", maxLength: 512 },
        },
      },
    },
    handler: async (request, reply) => {
      const requesterId = request.user!.id;
      const { id: serverId } = request.params;
      const { userId: targetUserId, reason } = request.body;

      const auth = await requirePermission(requesterId, serverId, PERMISSIONS.BAN_MEMBERS);
      if (!auth) return reply.code(403).send({ error: "Missing BAN_MEMBERS permission" });

      // Cannot ban the server owner
      const [server] = await db
        .select({ ownerId: servers.ownerId })
        .from(servers)
        .where(eq(servers.id, serverId))
        .limit(1);

      if (server?.ownerId === targetUserId) {
        return reply.code(400).send({ error: "Cannot ban the server owner" });
      }

      // Cannot ban yourself
      if (requesterId === targetUserId) {
        return reply.code(400).send({ error: "Cannot ban yourself" });
      }

      await db.transaction(async (tx) => {
        // Insert ban record (ignore if already banned)
        await tx
          .insert(bans)
          .values({
            serverId,
            userId: targetUserId,
            bannedBy: requesterId,
            reason: reason ?? null,
          })
          .onConflictDoNothing();

        // Remove membership if they're a member
        await tx
          .delete(serverMembers)
          .where(
            and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, targetUserId)),
          );
      });

      // Notify server room that member left
      fastify.io
        ?.to(`server:${serverId}`)
        .emit("member:left", { serverId, userId: targetUserId });

      // Notify the banned user
      fastify.io
        ?.to(`user:${targetUserId}`)
        .emit("member:kicked", { serverId });

      return reply.code(200).send({ ok: true });
    },
  });

  // -------------------------------------------------------------------------
  // DELETE /:id/bans/:userId — unban a user
  // -------------------------------------------------------------------------
  fastify.delete<{ Params: { id: string; userId: string } }>("/:id/bans/:userId", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const requesterId = request.user!.id;
      const { id: serverId, userId: targetUserId } = request.params;

      const auth = await requirePermission(requesterId, serverId, PERMISSIONS.BAN_MEMBERS);
      if (!auth) return reply.code(403).send({ error: "Missing BAN_MEMBERS permission" });

      const deleted = await db
        .delete(bans)
        .where(and(eq(bans.serverId, serverId), eq(bans.userId, targetUserId)))
        .returning({ id: bans.id });

      if (deleted.length === 0) {
        return reply.code(404).send({ error: "Ban not found" });
      }

      return reply.code(200).send({ ok: true });
    },
  });
}
