import type { Socket, Server as SocketIOServer } from "socket.io";
import type { FastifyBaseLogger } from "fastify";
import { redis } from "../../db/redis.js";

const TYPING_TTL_SECONDS = 30; // Auto-expire in case of crash

export async function registerTypingHandlers(
  socket: Socket,
  io: SocketIOServer,
  logger: FastifyBaseLogger,
): Promise<void> {
  const userId = socket.data.userId as string;

  socket.on("typing:start", async ({ channelId }: { channelId: string }) => {
    try {
      const key = `typing:${channelId}`;
      await redis.sAdd(key, userId);
      await redis.expire(key, TYPING_TTL_SECONDS);

      // Broadcast current typing state to channel room (exclude sender)
      const typingUserIds = await redis.sMembers(key);
      socket.to(`channel:${channelId}`).emit("typing:update", {
        channelId,
        typingUserIds,
      });
    } catch (err) {
      logger.error({ err, userId, channelId }, "typing:start handler error");
    }
  });

  socket.on("typing:stop", async ({ channelId }: { channelId: string }) => {
    try {
      const key = `typing:${channelId}`;
      await redis.sRem(key, userId);

      const typingUserIds = await redis.sMembers(key);
      socket.to(`channel:${channelId}`).emit("typing:update", {
        channelId,
        typingUserIds,
      });
    } catch (err) {
      logger.error({ err, userId, channelId }, "typing:stop handler error");
    }
  });

  // Clean up typing state on disconnect for ALL channels the socket was in
  socket.on("disconnect", async () => {
    try {
      // Get all rooms this socket was in (channel rooms start with "channel:")
      const rooms = [...socket.rooms].filter((r) => r.startsWith("channel:"));
      for (const room of rooms) {
        const channelId = room.replace("channel:", "");
        const key = `typing:${channelId}`;
        const removed = await redis.sRem(key, userId);
        if (removed > 0) {
          const typingUserIds = await redis.sMembers(key);
          socket.to(`channel:${channelId}`).emit("typing:update", {
            channelId,
            typingUserIds,
          });
        }
      }
    } catch (err) {
      logger.error({ err, userId }, "typing disconnect cleanup error");
    }
  });
}
