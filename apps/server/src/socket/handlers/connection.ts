import type { Socket, Server as SocketIOServer } from "socket.io";
import type { FastifyBaseLogger } from "fastify";
import { db } from "../../db/client.js";
import { channels, serverMembers, dmParticipants } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import { registerPresenceHandlers } from "./presence.js";
import { registerTypingHandlers } from "./typing.js";

/**
 * Registers connection and disconnection event handlers on a connected socket.
 *
 * On connect:
 *   - Joins the user's personal room: user:{userId}
 *   - Joins all server rooms the user is a member of: server:{serverId}
 *   - Joins all text channel rooms in those servers: channel:{channelId}
 *   - Registers presence handlers (Redis INCR, snapshot, grace-period disconnect)
 *
 * Runtime events:
 *   - server:subscribe   — join a new server room after joining via invite; also joins channel rooms
 *   - server:unsubscribe — leave a server room after leaving a server
 *   - channel:subscribe  — join a specific channel room (verified against membership)
 *   - ping               — basic health check, responds with pong
 */
export async function registerConnectionHandlers(
  socket: Socket,
  logger: FastifyBaseLogger,
  io: SocketIOServer,
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

  // Join all text channel rooms in servers the user is a member of
  const memberChannels = await db
    .select({ channelId: channels.id })
    .from(channels)
    .innerJoin(serverMembers, eq(channels.serverId, serverMembers.serverId))
    .where(and(eq(serverMembers.userId, userId), eq(channels.type, "text")));

  for (const { channelId } of memberChannels) {
    await socket.join(`channel:${channelId}`);
  }

  // Join all DM channel rooms the user participates in
  const dmChannels = await db
    .select({ channelId: dmParticipants.channelId })
    .from(dmParticipants)
    .where(eq(dmParticipants.userId, userId));

  for (const { channelId } of dmChannels) {
    await socket.join(`channel:${channelId}`);
  }

  logger.info(
    {
      userId,
      serverRooms: memberships.length,
      channelRooms: memberChannels.length,
      dmRooms: dmChannels.length,
    },
    "User joined rooms",
  );

  // Register presence handlers — INCR on connect, grace-period DECR on disconnect,
  // snapshot to connecting socket, idle/active/dnd event listeners
  await registerPresenceHandlers(socket, io, logger, memberships);

  // Register typing handlers — relay typing:start/stop via Redis Sets,
  // auto-clean typing state on disconnect
  await registerTypingHandlers(socket, io, logger);

  // Join a new server room after joining via invite (no reconnect needed)
  // Also joins all text channel rooms for that server.
  socket.on("server:subscribe", async ({ serverId }: { serverId: string }) => {
    // Verify the user is actually a member before joining the room
    const [membership] = await db
      .select({ id: serverMembers.id })
      .from(serverMembers)
      .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)));

    if (membership) {
      await socket.join(`server:${serverId}`);
      logger.info({ userId, serverId }, "User subscribed to server room");

      // Also join all text channel rooms for this server
      const serverChannels = await db
        .select({ channelId: channels.id })
        .from(channels)
        .where(and(eq(channels.serverId, serverId), eq(channels.type, "text")));

      for (const { channelId } of serverChannels) {
        await socket.join(`channel:${channelId}`);
      }

      logger.info(
        { userId, serverId, channelRooms: serverChannels.length },
        "User joined server channel rooms",
      );
    }
  });

  // Leave a server room after leaving a server
  socket.on("server:unsubscribe", ({ serverId }: { serverId: string }) => {
    socket.leave(`server:${serverId}`);
    logger.info({ userId, serverId }, "User unsubscribed from server room");
  });

  // Join a specific channel room dynamically (e.g., after a new channel is created)
  // Verifies the user has access to the channel before allowing the join.
  // Supports both server text channels (via serverMembers) and DM channels (via dmParticipants).
  socket.on("channel:subscribe", async ({ channelId }: { channelId: string }) => {
    // First, try server channel access (inner join channels ↔ serverMembers)
    const [serverAccess] = await db
      .select({ id: channels.id })
      .from(channels)
      .innerJoin(serverMembers, eq(channels.serverId, serverMembers.serverId))
      .where(and(eq(channels.id, channelId), eq(serverMembers.userId, userId)));

    if (serverAccess) {
      await socket.join(`channel:${channelId}`);
      logger.info({ userId, channelId }, "User subscribed to channel room");
      return;
    }

    // Fall back to DM channel access (dmParticipants)
    const [dmAccess] = await db
      .select({ id: dmParticipants.id })
      .from(dmParticipants)
      .where(and(eq(dmParticipants.channelId, channelId), eq(dmParticipants.userId, userId)));

    if (dmAccess) {
      await socket.join(`channel:${channelId}`);
      logger.info({ userId, channelId }, "User subscribed to DM channel room");
    }
  });

  // Basic health check for WebSocket connectivity
  socket.on("ping", () => {
    socket.emit("pong");
  });

  // Note: disconnect logging is now handled inside registerPresenceHandlers
  // which also sets up the 30-second grace period for presence:offline broadcast.
  // Socket.IO supports multiple handlers on the same event — both fire on disconnect.
  socket.on("disconnect", (reason) => {
    logger.info({ userId, socketId: socket.id, reason }, "User disconnected");
  });
}
