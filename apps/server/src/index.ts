import Fastify from "fastify";
import { TETHER_VERSION } from "@tether/shared";

const server = Fastify({ logger: true });

server.get("/", async () => {
  return { status: "ok", version: TETHER_VERSION };
});

const port = Number(process.env.PORT) || 3001;

server.listen({ port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  console.log(`Tether server running on :${port} at ${address}`);
});
