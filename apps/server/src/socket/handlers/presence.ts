import type { Socket, Server as SocketIOServer } from "socket.io";
import type { FastifyBaseLogger } from "fastify";
import type { PresenceStatus, PresenceUpdateEvent, PresenceSnapshotEvent } from "@tether/shared";
import { redis } from "../../db/redis.js";
import { db } from "../../db/client.js";
import { serverMembers } from "../../db/schema.js";
import { eq, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Status resolution — pure function, exported for testing
// ---------------------------------------------------------------------------

/**
 * Resolves the effective presence status based on Redis state.
 * Priority order: offline > dnd > idle > online
 */
export function resolveStatus(count: number, hasDnd: boolean, hasIdle: boolean): PresenceStatus {
  if (count <= 0) return "offline";
  if (hasDnd) return "dnd";
  if (hasIdle) return "idle";
  return "online";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Broadcast presence:update to all server rooms this user belongs to */
async function broadcastToServerRooms(
  io: SocketIOServer,
  userId: string,
  status: PresenceStatus,
  serverIds: string[],
): Promise<void> {
  if (serverIds.length === 0) return;
  const event: PresenceUpdateEvent = { userId, status };
  for (const serverId of serverIds) {
    io.to(`server:${serverId}`).emit("presence:update", event);
  }
}

/** Get server IDs the user belongs to from the DB */
async function getUserServerIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, userId));
  return rows.map((r) => r.serverId);
}

/** Read the resolved presence status for a userId from Redis */
async function getStatusFromRedis(userId: string): Promise<PresenceStatus> {
  const [countStr, dndVal, idleVal] = await Promise.all([
    redis.get(`presence:count:${userId}`),
    redis.get(`presence:dnd:${userId}`),
    redis.get(`presence:idle:${userId}`),
  ]);
  const count = countStr ? parseInt(countStr, 10) : 0;
  return resolveStatus(count, !!dndVal, !!idleVal);
}

// ---------------------------------------------------------------------------
// Main handler registration
// ---------------------------------------------------------------------------

/**
 * Registers presence-related socket event handlers on the connected socket.
 *
 * On connect:
 *   - Increments Redis presence:count:{userId}
 *   - If first connection (count === 1): broadcasts presence:update online to server rooms
 *   - Sends presence:snapshot to the connecting socket with statuses for all server co-members
 *
 * On disconnect (after 30s grace):
 *   - Decrements Redis presence:count:{userId}
 *   - If no connections remain (count <= 0): broadcasts presence:update offline to server rooms
 *
 * Socket events:
 *   - presence:idle   — mark user as idle (15-min TTL in Redis)
 *   - presence:active — clear idle flag, resolve back to online or dnd
 *   - presence:dnd    — toggle DND state
 */
export async function registerPresenceHandlers(
  socket: Socket,
  io: SocketIOServer,
  logger: FastifyBaseLogger,
  memberships: Array<{ serverId: string }>,
): Promise<void> {
  const userId = socket.data.userId as string;
  const serverIds = memberships.map((m) => m.serverId);

  // --- On connect: increment presence counter ---
  const count = await redis.incr(`presence:count:${userId}`);

  logger.info({ userId, socketId: socket.id, count }, "Presence counter incremented");

  if (count === 1) {
    // First socket: user just came online — broadcast to server rooms
    await broadcastToServerRooms(io, userId, "online", serverIds);
    logger.info({ userId, serverIds }, "Broadcast presence:update online");
  }

  // --- Send snapshot to the connecting socket ---
  await sendPresenceSnapshot(socket, userId, serverIds, logger);

  // --- Idle event: client signals user went idle ---
  socket.on("presence:idle", async () => {
    try {
      const IDLE_TTL_SECONDS = 15 * 60; // 15 minutes
      await redis.set(`presence:idle:${userId}`, "1", { EX: IDLE_TTL_SECONDS });

      // Resolve status (dnd takes priority over idle)
      const dndVal = await redis.get(`presence:dnd:${userId}`);
      const countStr = await redis.get(`presence:count:${userId}`);
      const currentCount = countStr ? parseInt(countStr, 10) : 0;
      const status = resolveStatus(currentCount, !!dndVal, true);

      const currentServerIds = await getUserServerIds(userId);
      await broadcastToServerRooms(io, userId, status, currentServerIds);
      logger.info({ userId, status }, "Broadcast presence:update after idle");
    } catch (err) {
      logger.error({ err, userId }, "Error handling presence:idle");
    }
  });

  // --- Active event: client signals user is active again ---
  socket.on("presence:active", async () => {
    try {
      await redis.del(`presence:idle:${userId}`);

      const dndVal = await redis.get(`presence:dnd:${userId}`);
      const countStr = await redis.get(`presence:count:${userId}`);
      const currentCount = countStr ? parseInt(countStr, 10) : 0;
      const status = resolveStatus(currentCount, !!dndVal, false);

      const currentServerIds = await getUserServerIds(userId);
      await broadcastToServerRooms(io, userId, status, currentServerIds);
      logger.info({ userId, status }, "Broadcast presence:update after active");
    } catch (err) {
      logger.error({ err, userId }, "Error handling presence:active");
    }
  });

  // --- DND event: toggle Do Not Disturb state ---
  socket.on("presence:dnd", async () => {
    try {
      const existing = await redis.get(`presence:dnd:${userId}`);
      if (existing) {
        await redis.del(`presence:dnd:${userId}`);
      } else {
        await redis.set(`presence:dnd:${userId}`, "1");
      }

      const idleVal = await redis.get(`presence:idle:${userId}`);
      const countStr = await redis.get(`presence:count:${userId}`);
      const currentCount = countStr ? parseInt(countStr, 10) : 0;
      const status = resolveStatus(currentCount, !existing, !!idleVal);

      const currentServerIds = await getUserServerIds(userId);
      await broadcastToServerRooms(io, userId, status, currentServerIds);
      logger.info({ userId, status, dnd: !existing }, "Broadcast presence:update after dnd toggle");
    } catch (err) {
      logger.error({ err, userId }, "Error handling presence:dnd");
    }
  });

  // --- On disconnect: 30-second grace period before going offline ---
  socket.on("disconnect", (reason) => {
    logger.info({ userId, socketId: socket.id, reason }, "Socket disconnected — starting 30s grace period");

    setTimeout(async () => {
      try {
        const remaining = await redis.decr(`presence:count:${userId}`);
        logger.info({ userId, remaining }, "Presence counter decremented after grace period");

        if (remaining <= 0) {
          // Clean up all presence keys
          await Promise.all([
            redis.del(`presence:count:${userId}`),
            redis.del(`presence:idle:${userId}`),
          ]);

          // Re-query server memberships (user could have joined/left during 30s)
          const currentServerIds = await getUserServerIds(userId);
          await broadcastToServerRooms(io, userId, "offline", currentServerIds);
          logger.info({ userId, currentServerIds }, "Broadcast presence:update offline");
        }
      } catch (err) {
        logger.error({ err, userId }, "Error in presence disconnect grace period");
      }
    }, 30_000);
  });
}

// ---------------------------------------------------------------------------
// Snapshot hydration
// ---------------------------------------------------------------------------

/**
 * Builds and emits a presence:snapshot to the connecting socket.
 * Includes status for all users who share at least one server with this user.
 */
async function sendPresenceSnapshot(
  socket: Socket,
  userId: string,
  serverIds: string[],
  logger: FastifyBaseLogger,
): Promise<void> {
  if (serverIds.length === 0) {
    const event: PresenceSnapshotEvent = { presenceMap: {} };
    socket.emit("presence:snapshot", event);
    return;
  }

  // Get all unique user IDs across all co-member servers
  const memberRows = await db
    .select({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(inArray(serverMembers.serverId, serverIds));

  const uniqueUserIds = [...new Set(memberRows.map((r) => r.userId))];

  if (uniqueUserIds.length === 0) {
    const event: PresenceSnapshotEvent = { presenceMap: {} };
    socket.emit("presence:snapshot", event);
    return;
  }

  // Fetch all presence keys in parallel using Promise.all
  const statusEntries = await Promise.all(
    uniqueUserIds.map(async (uid) => {
      const status = await getStatusFromRedis(uid);
      return [uid, status] as [string, PresenceStatus];
    }),
  );

  const presenceMap: Record<string, PresenceStatus> = Object.fromEntries(statusEntries);

  const event: PresenceSnapshotEvent = { presenceMap };
  socket.emit("presence:snapshot", event);

  logger.info(
    { userId, snapshotSize: uniqueUserIds.length },
    "Sent presence:snapshot to connecting socket",
  );
}
