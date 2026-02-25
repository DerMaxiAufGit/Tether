import Fastify from "fastify";
import { TETHER_VERSION } from "@tether/shared";
import corsPlugin from "./plugins/cors.js";
import cookiePlugin from "./plugins/cookie.js";
import authPlugin from "./plugins/auth.js";
import registerRoute from "./routes/auth/register.js";
import loginRoute from "./routes/auth/login.js";
import logoutRoute from "./routes/auth/logout.js";
import refreshRoute from "./routes/auth/refresh.js";
import changePasswordRoute from "./routes/auth/change-password.js";

const server = Fastify({ logger: true });

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

// Graceful shutdown
const shutdown = async (): Promise<void> => {
  server.log.info("Shutting down server...");
  await server.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

const port = Number(process.env.PORT) || 3001;

server.listen({ port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`Tether server running on :${port} at ${address}`);
});
