import type { Socket } from "socket.io";
import type { FastifyBaseLogger } from "fastify";

/**
 * Registers connection and disconnection event handlers on a connected socket.
 * Future phases will add handlers here: message:send, typing:start, voice:join, etc.
 */
export function registerConnectionHandlers(
  socket: Socket,
  logger: FastifyBaseLogger
): void {
  const userId = socket.data.userId;

  logger.info({ userId, socketId: socket.id }, "User connected");

  // Basic health check for WebSocket connectivity
  socket.on("ping", () => {
    socket.emit("pong");
  });

  socket.on("disconnect", (reason) => {
    logger.info({ userId, socketId: socket.id, reason }, "User disconnected");
  });
}
