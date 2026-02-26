import Fastify from "fastify";
import type { Server as SocketIOServer } from "socket.io";
import { TETHER_VERSION } from "@tether/shared";
import corsPlugin from "./plugins/cors.js";
import cookiePlugin from "./plugins/cookie.js";
import authPlugin from "./plugins/auth.js";
import registerRoute from "./routes/auth/register.js";
import loginRoute from "./routes/auth/login.js";
import logoutRoute from "./routes/auth/logout.js";
import refreshRoute from "./routes/auth/refresh.js";
import changePasswordRoute from "./routes/auth/change-password.js";
import challengeRoute from "./routes/auth/challenge.js";
import meRoute from "./routes/auth/me.js";
import createServerRoute from "./routes/servers/create.js";
import listServersRoute from "./routes/servers/index.js";
import serverByIdRoute from "./routes/servers/[id].js";
import serverMembersRoute from "./routes/servers/members.js";
import serverInvitesRoute from "./routes/servers/invites.js";
import inviteJoinRoute from "./routes/invites/join.js";
import listChannelsRoute from "./routes/channels/index.js";
import createChannelRoute from "./routes/channels/create.js";
import channelByIdRoute from "./routes/channels/[id].js";
import reorderChannelsRoute from "./routes/channels/reorder.js";
import createMessageRoute from "./routes/messages/create.js";
import listMessagesRoute from "./routes/messages/list.js";
import deleteMessageRoute from "./routes/messages/delete.js";
import { setupSocketIO } from "./socket/index.js";

// Augment Fastify types so route handlers can access io
declare module "fastify" {
  interface FastifyInstance {
    io: SocketIOServer;
  }
}

const server = Fastify({ logger: true });

// Pre-decorate io with null BEFORE server starts (Fastify 5 requirement:
// decorators cannot be added after server.listen() is called)
// The actual Socket.IO instance is assigned after HTTP server is ready.
server.decorate("io", null as unknown as SocketIOServer);

// Register plugins (order matters: cors -> cookie -> auth)
await server.register(corsPlugin);
await server.register(cookiePlugin);
await server.register(authPlugin);

// Health check
server.get("/", async () => {
  return { status: "ok", version: TETHER_VERSION };
});

// Auth routes
await server.register(registerRoute, { prefix: "/api/auth" });
await server.register(loginRoute, { prefix: "/api/auth" });
await server.register(logoutRoute, { prefix: "/api/auth" });
await server.register(refreshRoute, { prefix: "/api/auth" });
await server.register(changePasswordRoute, { prefix: "/api/auth" });
await server.register(challengeRoute, { prefix: "/api/auth" });
await server.register(meRoute, { prefix: "/api/auth" });

// Server routes
await server.register(createServerRoute, { prefix: "/api/servers" });
await server.register(listServersRoute, { prefix: "/api/servers" });
await server.register(serverByIdRoute, { prefix: "/api/servers" });
await server.register(serverMembersRoute, { prefix: "/api/servers" });
await server.register(serverInvitesRoute, { prefix: "/api/servers" });

// Invite routes
await server.register(inviteJoinRoute, { prefix: "/api/invites" });

// Channel routes
await server.register(listChannelsRoute, { prefix: "/api/servers" });
await server.register(createChannelRoute, { prefix: "/api/servers" });
await server.register(channelByIdRoute, { prefix: "/api/channels" });
await server.register(reorderChannelsRoute, { prefix: "/api/servers" });

// Message routes
await server.register(createMessageRoute, { prefix: "/api/channels" });
await server.register(listMessagesRoute, { prefix: "/api/channels" });
await server.register(deleteMessageRoute, { prefix: "/api/messages" });

// Graceful shutdown
const shutdown = async (): Promise<void> => {
  server.log.info("Shutting down server...");
  // Close Socket.IO and its Redis client before closing Fastify
  if (server.io) {
    await new Promise<void>((resolve) => server.io.close(() => resolve()));
  }
  await server.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

const port = Number(process.env.PORT) || 3001;

server.listen({ port, host: "0.0.0.0" }, async (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`Tether server running on :${port} at ${address}`);

  // Attach Socket.IO to the Fastify HTTP server after it's listening.
  // We mutate the pre-decorated property (not decorate again) to comply
  // with Fastify 5's decorator-before-start requirement.
  const io = await setupSocketIO(server.server, server.log);
  // Directly assign to the decorated property (mutation, not re-decoration)
  (server as unknown as { io: SocketIOServer }).io = io;
  server.log.info("Socket.IO server ready");
});
