import { createClient, type RedisClientType } from "redis";

/**
 * Shared Redis client for application-level operations (presence, caching, etc.).
 * Separate from the Socket.IO adapter's Redis client to avoid blocking.
 *
 * Connection is established in setupSocketIO at server startup.
 */
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redis: RedisClientType = createClient({ url: redisUrl }) as RedisClientType;

redis.on("error", (err: Error) => {
  console.error({ err }, "Redis client error");
});
