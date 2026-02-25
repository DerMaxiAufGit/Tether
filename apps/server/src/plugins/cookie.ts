import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";

async function cookiePlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET ?? "dev-cookie-secret-change-in-production",
  });
}

export default fp(cookiePlugin, { name: "cookie" });
