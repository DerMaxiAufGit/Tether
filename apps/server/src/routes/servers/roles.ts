import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import {
  roles,
  memberRoles,
  serverMembers,
  servers,
} from "../../db/schema.js";
import { eq, and, sql, gt, asc, count } from "drizzle-orm";
import {
  requirePermission,
  getServerPermissions,
  getMemberHighestPosition,
} from "../../lib/permissions.js";
import {
  PERMISSIONS,
  hasBit,
  type CreateRoleRequest,
  type UpdateRoleRequest,
  type RoleResponse,
} from "@tether/shared";

function toRoleResponse(
  r: { id: string; serverId: string; name: string; permissions: string; color: string | null; position: number; createdAt: Date },
  memberCount: number,
): RoleResponse {
  return {
    id: r.id,
    serverId: r.serverId,
    name: r.name,
    permissions: r.permissions,
    color: r.color,
    position: r.position,
    createdAt: r.createdAt.toISOString(),
    memberCount,
  };
}

export default async function serverRolesRoute(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /:id/roles — list all roles (member only)
  // -------------------------------------------------------------------------
  fastify.get<{ Params: { id: string } }>("/:id/roles", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { id: serverId } = request.params;

      const perm = await getServerPermissions(userId, serverId);
      if (!perm) return reply.code(404).send({ error: "Server not found" });

      // Get all roles with member counts
      const roleRows = await db
        .select()
        .from(roles)
        .where(eq(roles.serverId, serverId))
        .orderBy(asc(roles.position));

      // Count members per role (exclude @everyone which is implicit)
      const countRows = await db
        .select({
          roleId: memberRoles.roleId,
          count: count(memberRoles.memberId),
        })
        .from(memberRoles)
        .innerJoin(roles, eq(roles.id, memberRoles.roleId))
        .where(eq(roles.serverId, serverId))
        .groupBy(memberRoles.roleId);

      const countMap = new Map(countRows.map((r) => [r.roleId, r.count]));

      // For @everyone (position 0), count is total server members
      const [totalMembers] = await db
        .select({ count: count(serverMembers.id) })
        .from(serverMembers)
        .where(eq(serverMembers.serverId, serverId));

      const result = roleRows.map((r) => {
        const mc = r.position === 0 ? (totalMembers?.count ?? 0) : (countMap.get(r.id) ?? 0);
        return toRoleResponse(r, mc);
      });

      return reply.code(200).send({ roles: result });
    },
  });

  // -------------------------------------------------------------------------
  // POST /:id/roles — create a new role (MANAGE_ROLES)
  // -------------------------------------------------------------------------
  fastify.post<{ Params: { id: string }; Body: CreateRoleRequest }>("/:id/roles", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
          permissions: { type: "string" },
          color: { type: ["string", "null"] },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { id: serverId } = request.params;
      const { name, permissions: permsStr, color } = request.body;

      const auth = await requirePermission(userId, serverId, PERMISSIONS.MANAGE_ROLES);
      if (!auth) return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });

      const requestedPerms = permsStr ? Number(permsStr) : 0;

      // Non-owners cannot grant permissions they don't have
      if (!auth.isOwner && (requestedPerms & ~auth.permissions) !== 0) {
        return reply.code(403).send({ error: "Cannot grant permissions you don't have" });
      }

      // New role gets position = max existing + 1 (above @everyone, below nothing)
      const [maxRow] = await db
        .select({ maxPos: sql<number>`COALESCE(MAX(${roles.position}), 0)` })
        .from(roles)
        .where(eq(roles.serverId, serverId));

      const position = (maxRow?.maxPos ?? 0) + 1;

      const [newRole] = await db
        .insert(roles)
        .values({
          serverId,
          name,
          permissions: String(requestedPerms),
          color: color ?? null,
          position,
        })
        .returning();

      const response = toRoleResponse(newRole, 0);

      fastify.io?.to(`server:${serverId}`).emit("role:created", { serverId, role: response });

      return reply.code(201).send({ role: response });
    },
  });

  // -------------------------------------------------------------------------
  // PATCH /:id/roles/:roleId — update a role (MANAGE_ROLES + hierarchy)
  // -------------------------------------------------------------------------
  fastify.patch<{ Params: { id: string; roleId: string }; Body: UpdateRoleRequest }>(
    "/:id/roles/:roleId",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100 },
            permissions: { type: "string" },
            color: { type: ["string", "null"] },
            position: { type: "integer", minimum: 0 },
          },
        },
      },
      handler: async (request, reply) => {
        const userId = request.user!.id;
        const { id: serverId, roleId } = request.params;
        const { name, permissions: permsStr, color, position } = request.body;

        const auth = await requirePermission(userId, serverId, PERMISSIONS.MANAGE_ROLES);
        if (!auth) return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });

        // Get the target role
        const [targetRole] = await db
          .select()
          .from(roles)
          .where(and(eq(roles.id, roleId), eq(roles.serverId, serverId)))
          .limit(1);

        if (!targetRole) return reply.code(404).send({ error: "Role not found" });

        // Hierarchy check: non-owners can only edit roles below their highest role
        if (!auth.isOwner) {
          const myHighest = await getMemberHighestPosition(auth.memberId);
          if (targetRole.position >= myHighest) {
            return reply.code(403).send({ error: "Cannot edit a role at or above your highest role" });
          }
        }

        // Cannot grant permissions the editor doesn't have (unless owner)
        if (permsStr !== undefined && !auth.isOwner) {
          const requestedPerms = Number(permsStr);
          if ((requestedPerms & ~auth.permissions) !== 0) {
            return reply.code(403).send({ error: "Cannot grant permissions you don't have" });
          }
        }

        const updateValues: Record<string, unknown> = {};
        if (name !== undefined && targetRole.position !== 0) updateValues.name = name;
        if (permsStr !== undefined) updateValues.permissions = permsStr;
        if (color !== undefined) updateValues.color = color;

        // Handle position change (swap positions)
        if (position !== undefined && position !== targetRole.position && targetRole.position !== 0) {
          if (!auth.isOwner) {
            const myHighest = await getMemberHighestPosition(auth.memberId);
            if (position >= myHighest) {
              return reply.code(403).send({ error: "Cannot move role to or above your highest role" });
            }
          }

          // Swap: find the role currently at the target position
          const [swapRole] = await db
            .select({ id: roles.id })
            .from(roles)
            .where(and(eq(roles.serverId, serverId), eq(roles.position, position)))
            .limit(1);

          if (swapRole) {
            await db
              .update(roles)
              .set({ position: targetRole.position })
              .where(eq(roles.id, swapRole.id));
          }

          updateValues.position = position;
        }

        if (Object.keys(updateValues).length === 0) {
          return reply.code(200).send({ role: toRoleResponse(targetRole, 0) });
        }

        const [updated] = await db
          .update(roles)
          .set(updateValues)
          .where(eq(roles.id, roleId))
          .returning();

        const response = toRoleResponse(updated, 0);

        fastify.io?.to(`server:${serverId}`).emit("role:updated", { serverId, role: response });

        return reply.code(200).send({ role: response });
      },
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /:id/roles/:roleId — delete a role (MANAGE_ROLES, not @everyone)
  // -------------------------------------------------------------------------
  fastify.delete<{ Params: { id: string; roleId: string } }>("/:id/roles/:roleId", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { id: serverId, roleId } = request.params;

      const auth = await requirePermission(userId, serverId, PERMISSIONS.MANAGE_ROLES);
      if (!auth) return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });

      const [targetRole] = await db
        .select()
        .from(roles)
        .where(and(eq(roles.id, roleId), eq(roles.serverId, serverId)))
        .limit(1);

      if (!targetRole) return reply.code(404).send({ error: "Role not found" });

      if (targetRole.position === 0) {
        return reply.code(400).send({ error: "Cannot delete the @everyone role" });
      }

      // Hierarchy check
      if (!auth.isOwner) {
        const myHighest = await getMemberHighestPosition(auth.memberId);
        if (targetRole.position >= myHighest) {
          return reply.code(403).send({ error: "Cannot delete a role at or above your highest role" });
        }
      }

      await db.delete(roles).where(eq(roles.id, roleId));

      fastify.io
        ?.to(`server:${serverId}`)
        .emit("role:deleted", { serverId, roleId });

      return reply.code(200).send({ ok: true });
    },
  });

  // -------------------------------------------------------------------------
  // PUT /:id/roles/:roleId/members/:memberId — assign role to member
  // -------------------------------------------------------------------------
  fastify.put<{ Params: { id: string; roleId: string; memberId: string } }>(
    "/:id/roles/:roleId/members/:memberId",
    {
      preHandler: [fastify.authenticate],
      handler: async (request, reply) => {
        const userId = request.user!.id;
        const { id: serverId, roleId, memberId } = request.params;

        const auth = await requirePermission(userId, serverId, PERMISSIONS.MANAGE_ROLES);
        if (!auth) return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });

        // Validate role belongs to this server and isn't @everyone
        const [role] = await db
          .select()
          .from(roles)
          .where(and(eq(roles.id, roleId), eq(roles.serverId, serverId)))
          .limit(1);

        if (!role) return reply.code(404).send({ error: "Role not found" });
        if (role.position === 0) {
          return reply.code(400).send({ error: "Cannot assign @everyone role" });
        }

        // Hierarchy check
        if (!auth.isOwner) {
          const myHighest = await getMemberHighestPosition(auth.memberId);
          if (role.position >= myHighest) {
            return reply.code(403).send({ error: "Cannot assign a role at or above your highest role" });
          }
        }

        // Validate member exists in this server
        const [member] = await db
          .select({ id: serverMembers.id })
          .from(serverMembers)
          .where(and(eq(serverMembers.id, memberId), eq(serverMembers.serverId, serverId)))
          .limit(1);

        if (!member) return reply.code(404).send({ error: "Member not found" });

        await db
          .insert(memberRoles)
          .values({ memberId, roleId })
          .onConflictDoNothing();

        fastify.io?.to(`server:${serverId}`).emit("member:roleAssigned", {
          serverId,
          memberId,
          roleId,
          roleName: role.name,
          roleColor: role.color,
        });

        return reply.code(200).send({ ok: true });
      },
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /:id/roles/:roleId/members/:memberId — remove role from member
  // -------------------------------------------------------------------------
  fastify.delete<{ Params: { id: string; roleId: string; memberId: string } }>(
    "/:id/roles/:roleId/members/:memberId",
    {
      preHandler: [fastify.authenticate],
      handler: async (request, reply) => {
        const userId = request.user!.id;
        const { id: serverId, roleId, memberId } = request.params;

        const auth = await requirePermission(userId, serverId, PERMISSIONS.MANAGE_ROLES);
        if (!auth) return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });

        const [role] = await db
          .select()
          .from(roles)
          .where(and(eq(roles.id, roleId), eq(roles.serverId, serverId)))
          .limit(1);

        if (!role) return reply.code(404).send({ error: "Role not found" });

        // Hierarchy check
        if (!auth.isOwner) {
          const myHighest = await getMemberHighestPosition(auth.memberId);
          if (role.position >= myHighest) {
            return reply.code(403).send({ error: "Cannot remove a role at or above your highest role" });
          }
        }

        await db
          .delete(memberRoles)
          .where(and(eq(memberRoles.memberId, memberId), eq(memberRoles.roleId, roleId)));

        fastify.io?.to(`server:${serverId}`).emit("member:roleRemoved", {
          serverId,
          memberId,
          roleId,
        });

        return reply.code(200).send({ ok: true });
      },
    },
  );
}
