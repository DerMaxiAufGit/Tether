import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";

async function corsPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyCors, {
    origin: process.env.CLIENT_URL ?? "http://localhost:5173",
    credentials: true,
  });
}

export default fp(corsPlugin, { name: "cors" });
