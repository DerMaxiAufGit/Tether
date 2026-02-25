import type { Socket } from "socket.io";
import type { FastifyBaseLogger } from "fastify";
import { db } from "../../db/client.js";
import { serverMembers } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

/**
 * Registers connection and disconnection event handlers on a connected socket.
 *
 * On connect:
 *   - Joins the user's personal room: user:{userId}
 *   - Joins all server rooms the user is a member of: server:{serverId}
 *
 * Runtime events:
 *   - server:subscribe   — join a new server room after joining via invite
 *   - server:unsubscribe — leave a server room after leaving a server
 *   - ping               — basic health check, responds with pong
 */
export async function registerConnectionHandlers(
  socket: Socket,
  logger: FastifyBaseLogger
): Promise<void> {
  const userId = socket.data.userId as string;

  logger.info({ userId, socketId: socket.id }, "User connected");

  // Query all server memberships for the connected user
  const memberships = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, userId));

  // Join personal room and all server rooms
  await socket.join(`user:${userId}`);
  for (const { serverId } of memberships) {
    await socket.join(`server:${serverId}`);
  }

  logger.info({ userId, rooms: memberships.length }, "User joined rooms");

  // Join a new server room after joining via invite (no reconnect needed)
  socket.on("server:subscribe", async ({ serverId }: { serverId: string }) => {
    // Verify the user is actually a member before joining the room
    const [membership] = await db
      .select({ id: serverMembers.id })
      .from(serverMembers)
      .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)));

    if (membership) {
      await socket.join(`server:${serverId}`);
      logger.info({ userId, serverId }, "User subscribed to server room");
    }
  });

  // Leave a server room after leaving a server
  socket.on("server:unsubscribe", ({ serverId }: { serverId: string }) => {
    socket.leave(`server:${serverId}`);
    logger.info({ userId, serverId }, "User unsubscribed from server room");
  });

  // Basic health check for WebSocket connectivity
  socket.on("ping", () => {
    socket.emit("pong");
  });

  socket.on("disconnect", (reason) => {
    logger.info({ userId, socketId: socket.id, reason }, "User disconnected");
  });
}
