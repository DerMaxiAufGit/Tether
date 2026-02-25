import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken } from "../lib/jwt.js";

// Augment Fastify's type system so request.user is available on protected routes
declare module "fastify" {
  interface FastifyRequest {
    user?: { id: string };
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        reply.code(401).send({ error: "Authentication required" });
        return;
      }

      const token = authHeader.slice(7);

      try {
        const payload = await verifyAccessToken(token);
        request.user = { id: payload.sub! };
      } catch {
        reply.code(401).send({ error: "Authentication required" });
      }
    }
  );
}

export default fp(authPlugin, { name: "auth" });
