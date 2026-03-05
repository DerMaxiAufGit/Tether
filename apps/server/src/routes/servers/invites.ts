import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/client.js";
import { invites, serverMembers, users } from "../../db/schema.js";
import { PERMISSIONS, type CreateInviteRequest, type InviteResponse } from "@tether/shared";
import { requirePermission, getServerPermissions } from "../../lib/permissions.js";

/**
 * Server invite CRUD routes:
 *   GET  /:id/invites           — list invites for a server (member only)
 *   POST /:id/invites           — create invite (member only)
 *   DELETE /:id/invites/:inviteId — revoke invite (member only)
 */
export default async function serverInvitesRoute(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /:id/invites — list all invites for a server
  // -------------------------------------------------------------------------
  fastify.get<{ Params: { id: string } }>("/:id/invites", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id: serverId } = request.params;
      const userId = request.user!.id;

      // Require MANAGE_INVITES to list invites
      const auth = await requirePermission(userId, serverId, PERMISSIONS.MANAGE_INVITES);
      if (!auth) {
        return reply.code(403).send({ error: "Missing MANAGE_INVITES permission" });
      }

      // Fetch all invites joined with creator display name
      const rows = await db
        .select({
          id: invites.id,
          serverId: invites.serverId,
          creatorId: invites.creatorId,
          code: invites.code,
          maxUses: invites.maxUses,
          uses: invites.uses,
          expiresAt: invites.expiresAt,
          createdAt: invites.createdAt,
          creatorDisplayName: users.displayName,
        })
        .from(invites)
        .innerJoin(users, eq(invites.creatorId, users.id))
        .where(eq(invites.serverId, serverId));

      const result: InviteResponse[] = rows.map((row) => ({
        id: row.id,
        serverId: row.serverId,
        creatorId: row.creatorId,
        code: row.code,
        maxUses: row.maxUses,
        uses: row.uses,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        creator: {
          id: row.creatorId,
          displayName: row.creatorDisplayName,
        },
      }));

      return reply.code(200).send(result);
    },
  });

  // -------------------------------------------------------------------------
  // POST /:id/invites — create a new invite
  // -------------------------------------------------------------------------
  fastify.post<{ Params: { id: string }; Body: CreateInviteRequest }>("/:id/invites", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        properties: {
          expiresIn: { type: "integer", minimum: 1 },
          maxUses: { oneOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
        },
        additionalProperties: false,
      },
    },
    handler: async (request, reply) => {
      const { id: serverId } = request.params;
      const userId = request.user!.id;
      const { expiresIn, maxUses } = request.body;

      // Require MANAGE_INVITES to create invites
      const auth = await requirePermission(userId, serverId, PERMISSIONS.MANAGE_INVITES);
      if (!auth) {
        return reply.code(403).send({ error: "Missing MANAGE_INVITES permission" });
      }

      // Generate 11-char URL-safe invite code using crypto.randomBytes
      const code = randomBytes(8).toString("base64url");

      // Calculate expiry if expiresIn provided
      const expiresAt = expiresIn != null ? new Date(Date.now() + expiresIn * 1000) : null;

      const [invite] = await db
        .insert(invites)
        .values({
          serverId,
          creatorId: userId,
          code,
          maxUses: maxUses ?? null,
          expiresAt,
        })
        .returning();

      const response: InviteResponse = {
        id: invite.id,
        serverId: invite.serverId,
        creatorId: invite.creatorId,
        code: invite.code,
        maxUses: invite.maxUses,
        uses: invite.uses,
        expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
        createdAt: invite.createdAt.toISOString(),
      };

      return reply.code(201).send(response);
    },
  });

  // -------------------------------------------------------------------------
  // DELETE /:id/invites/:inviteId — revoke an invite (member only)
  // -------------------------------------------------------------------------
  fastify.delete<{ Params: { id: string; inviteId: string } }>("/:id/invites/:inviteId", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id: serverId, inviteId } = request.params;
      const userId = request.user!.id;

      // Require MANAGE_INVITES to revoke invites
      const auth = await requirePermission(userId, serverId, PERMISSIONS.MANAGE_INVITES);
      if (!auth) {
        return reply.code(403).send({ error: "Missing MANAGE_INVITES permission" });
      }

      // Delete the invite
      const deleted = await db
        .delete(invites)
        .where(and(eq(invites.id, inviteId), eq(invites.serverId, serverId)))
        .returning({ id: invites.id });

      if (deleted.length === 0) {
        return reply.code(404).send({ error: "Invite not found" });
      }

      return reply.code(200).send({ ok: true });
    },
  });
}
