/**
 * One-time seed script: creates @everyone roles for existing servers
 * that don't have a position-0 role yet.
 *
 * Usage: npx tsx apps/server/src/db/seed-everyone-roles.ts
 */
import { db } from "./client.js";
import { servers, roles } from "./schema.js";
import { eq, sql } from "drizzle-orm";
import { DEFAULT_EVERYONE_PERMISSIONS } from "@tether/shared";

async function seed() {
  // Find servers that don't have a position-0 role
  const serversWithoutEveryone = await db
    .select({ id: servers.id })
    .from(servers)
    .where(
      sql`${servers.id} NOT IN (
        SELECT ${roles.serverId} FROM ${roles} WHERE ${roles.position} = 0
      )`,
    );

  if (serversWithoutEveryone.length === 0) {
    console.log("All servers already have @everyone roles.");
    process.exit(0);
  }

  console.log(`Seeding @everyone role for ${serversWithoutEveryone.length} server(s)...`);

  await db.insert(roles).values(
    serversWithoutEveryone.map((s) => ({
      serverId: s.id,
      name: "@everyone",
      permissions: String(DEFAULT_EVERYONE_PERMISSIONS),
      position: 0,
    })),
  );

  console.log("Done.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
