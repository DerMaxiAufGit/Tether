import { Server } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-streams-adapter";
import type { FastifyBaseLogger } from "fastify";
import type { Server as HttpServer } from "node:http";
import { socketAuthMiddleware } from "./middleware/auth.js";
import { registerConnectionHandlers } from "./handlers/connection.js";
import { redis } from "../db/redis.js";

/**
 * Sets up the Socket.IO server attached to the provided HTTP server.
 * Uses Redis Streams adapter for horizontal scalability.
 * Gracefully degrades if Redis is unavailable (logs warning, no adapter).
 *
 * Also connects the shared Redis client used for presence operations.
 *
 * @returns The Socket.IO Server instance for use in route handlers
 */
export async function setupSocketIO(
  httpServer: HttpServer,
  logger: FastifyBaseLogger
): Promise<Server> {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const clientUrl = process.env.CLIENT_URL ?? "http://localhost:5173";

  // Separate Redis client for Socket.IO adapter (avoids blocking other Redis usage)
  const redisClient = createClient({ url: redisUrl });

  let io: Server;

  try {
    await redisClient.connect();
    logger.info({ redisUrl }, "Redis connected for Socket.IO adapter");

    io = new Server(httpServer, {
      adapter: createAdapter(redisClient),
      cors: {
        origin: clientUrl,
        credentials: true,
      },
    });

    // Handle Redis disconnection gracefully
    redisClient.on("error", (err: Error) => {
      logger.warn({ err }, "Redis adapter error — real-time delivery may be degraded");
    });
  } catch (err) {
    logger.warn(
      { err, redisUrl },
      "Redis unavailable — Socket.IO running without adapter (single-instance mode)"
    );

    // Fallback: Socket.IO without Redis adapter (works in dev/single instance)
    io = new Server(httpServer, {
      cors: {
        origin: clientUrl,
        credentials: true,
      },
    });
  }

  // Connect the shared Redis client used for presence operations.
  // Separate from the adapter client per established pattern (see STATE.md decision 01-05).
  try {
    await redis.connect();
    logger.info({ redisUrl }, "Redis connected for presence operations");
  } catch (err) {
    logger.warn({ err, redisUrl }, "Shared Redis client failed to connect — presence features unavailable");
  }

  // Register JWT authentication middleware
  io.use(socketAuthMiddleware);

  // Register connection handlers (async — fire-and-forget with error boundary)
  io.on("connection", (socket) => {
    registerConnectionHandlers(socket, logger, io).catch((err: Error) =>
      logger.error({ err }, "Connection handler error")
    );
  });

  return io;
}

export type { Server };
