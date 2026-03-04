import type { FastifyInstance } from "fastify";
import { eq, and, count, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { invites, serverMembers, servers, users } from "../../db/schema.js";
import type { InviteInfoResponse } from "@tether/shared";

/**
 * Invite join routes:
 *   GET  /:code       — invite preview (no auth required)
 *   POST /:code/join  — atomic join via invite code (auth required)
 */
export default async function inviteJoinRoute(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /:code — invite preview (unauthenticated access allowed)
  // -------------------------------------------------------------------------
  fastify.get<{ Params: { code: string } }>("/:code", {
    handler: async (request, reply) => {
      const { code } = request.params;

      // Look up invite, join server, creator, and member count
      const [row] = await db
        .select({
          inviteId: invites.id,
          serverId: invites.serverId,
          expiresAt: invites.expiresAt,
          maxUses: invites.maxUses,
          uses: invites.uses,
          serverName: servers.name,
          serverIcon: servers.iconUrl,
          creatorName: users.displayName,
        })
        .from(invites)
        .innerJoin(servers, eq(invites.serverId, servers.id))
        .innerJoin(users, eq(invites.creatorId, users.id))
        .where(eq(invites.code, code));

      if (!row) {
        return reply.code(404).send({ error: "Invite not found" });
      }

      // Check if invite is expired or exhausted
      const now = new Date();
      const isExpired = row.expiresAt != null && row.expiresAt <= now;
      const isExhausted = row.maxUses != null && row.uses >= row.maxUses;

      if (isExpired || isExhausted) {
        return reply.code(410).send({
          error: "Invite is expired or has reached its use limit",
        });
      }

      // Get member count for the server
      const [countRow] = await db
        .select({ memberCount: count(serverMembers.id) })
        .from(serverMembers)
        .where(eq(serverMembers.serverId, row.serverId));

      const response: InviteInfoResponse = {
        code,
        serverName: row.serverName,
        serverIcon: row.serverIcon,
        creatorName: row.creatorName,
        memberCount: countRow?.memberCount ?? 0,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      };

      return reply.code(200).send(response);
    },
  });

  // -------------------------------------------------------------------------
  // POST /:code/join — atomic join server via invite code
  // -------------------------------------------------------------------------
  fastify.post<{ Params: { code: string } }>("/:code/join", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { code } = request.params;
      const userId = request.user!.id;

      const result = await db.transaction(async (tx) => {
        // Step 1: Look up the invite to get serverId (needed for membership check)
        const [existingInvite] = await tx
          .select({
            id: invites.id,
            serverId: invites.serverId,
            expiresAt: invites.expiresAt,
            maxUses: invites.maxUses,
            uses: invites.uses,
          })
          .from(invites)
          .where(eq(invites.code, code));

        if (!existingInvite) {
          return { status: 410 as const, error: "Invite is expired or has reached its use limit" };
        }

        // Step 2: Check if user is already a member — return 409 before consuming a use
        const [membership] = await tx
          .select({ id: serverMembers.id })
          .from(serverMembers)
          .where(
            and(
              eq(serverMembers.serverId, existingInvite.serverId),
              eq(serverMembers.userId, userId),
            ),
          );

        if (membership) {
          return { status: 409 as const, error: "Already a member of this server" };
        }

        // Step 3: Atomic update — increment uses only if invite is still valid.
        // Uses a single UPDATE with WHERE conditions to prevent race conditions.
        // If no row is returned, the invite expired or reached max uses between
        // our read and this update.
        const [updatedInvite] = await tx
          .update(invites)
          .set({ uses: sql`${invites.uses} + 1` })
          .where(
            sql`${invites.code} = ${code}
              AND (${invites.maxUses} IS NULL OR ${invites.uses} < ${invites.maxUses})
              AND (${invites.expiresAt} IS NULL OR ${invites.expiresAt} > NOW())`,
          )
          .returning();

        if (!updatedInvite) {
          return { status: 410 as const, error: "Invite is expired or has reached its use limit" };
        }

        // Step 4: Insert the new server membership
        await tx.insert(serverMembers).values({
          serverId: updatedInvite.serverId,
          userId,
        });

        // Step 5: Fetch the server to return in the response
        const [server] = await tx
          .select()
          .from(servers)
          .where(eq(servers.id, updatedInvite.serverId));

        return { status: 200 as const, server, serverId: updatedInvite.serverId };
      });

      if (result.status === 409) {
        return reply.code(409).send({ error: result.error });
      }

      if (result.status === 410) {
        return reply.code(410).send({ error: result.error });
      }

      const { server, serverId } = result;

      // Broadcast to the server room that a new member has joined
      fastify.io?.to(`server:${serverId}`).emit("member:joined", { serverId, userId });

      return reply.code(200).send({
        server: {
          id: server.id,
          name: server.name,
          ownerId: server.ownerId,
          iconUrl: server.iconUrl,
          createdAt: server.createdAt.toISOString(),
          updatedAt: server.updatedAt.toISOString(),
        },
      });
    },
  });
}
