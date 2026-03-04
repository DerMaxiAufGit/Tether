import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels, dmParticipants, serverMembers, users } from "../../db/schema.js";
import { eq, and, inArray } from "drizzle-orm";

interface CreateDMBody {
  recipientUserId: string;
}

/**
 * POST /api/dms — Find or create a DM channel between the authenticated user and a recipient.
 *
 * Requirements:
 *   - Auth required
 *   - Recipient must share at least one server with the authenticated user
 *   - If a DM channel already exists between the two users, return it
 *   - If not, create a new channel (type='dm', serverId=null) + two dmParticipants rows
 *
 * After creation, both users' sockets join the channel:{channelId} room.
 *
 * Returns: { channelId, participant: { id, displayName, avatarUrl, x25519PublicKey } }
 * (participant = the OTHER user's info)
 */
export default async function createDMRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: CreateDMBody }>("/", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["recipientUserId"],
        properties: {
          recipientUserId: { type: "string", format: "uuid" },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { recipientUserId } = request.body;

      // Cannot DM yourself
      if (userId === recipientUserId) {
        return reply.code(400).send({ error: "You cannot DM yourself" });
      }

      // Verify recipient exists
      const [recipient] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          x25519PublicKey: users.x25519PublicKey,
        })
        .from(users)
        .where(eq(users.id, recipientUserId))
        .limit(1);

      if (!recipient) {
        return reply.code(404).send({ error: "Recipient not found" });
      }

      // Validate that the two users share at least one server
      const authUserServers = await db
        .select({ serverId: serverMembers.serverId })
        .from(serverMembers)
        .where(eq(serverMembers.userId, userId));

      if (authUserServers.length === 0) {
        return reply.code(403).send({ error: "You must share a server with this user to DM them" });
      }

      const sharedServerIds = authUserServers.map((m) => m.serverId);

      const [sharedServer] = await db
        .select({ id: serverMembers.id })
        .from(serverMembers)
        .where(
          and(
            eq(serverMembers.userId, recipientUserId),
            inArray(serverMembers.serverId, sharedServerIds),
          ),
        )
        .limit(1);

      if (!sharedServer) {
        return reply.code(403).send({ error: "You must share a server with this user to DM them" });
      }

      // Find existing DM channel between the two users:
      // Look for channels where the auth user is a participant, then check if recipient is also in one
      const selfParticipations = await db
        .select({ channelId: dmParticipants.channelId })
        .from(dmParticipants)
        .where(eq(dmParticipants.userId, userId));

      let existingChannelId: string | null = null;

      if (selfParticipations.length > 0) {
        const candidateChannelIds = selfParticipations.map((p) => p.channelId);

        const [recipientParticipation] = await db
          .select({ channelId: dmParticipants.channelId })
          .from(dmParticipants)
          .where(
            and(
              eq(dmParticipants.userId, recipientUserId),
              inArray(dmParticipants.channelId, candidateChannelIds),
            ),
          )
          .limit(1);

        if (recipientParticipation) {
          existingChannelId = recipientParticipation.channelId;
        }
      }

      if (existingChannelId) {
        // Return existing DM channel
        return reply.code(200).send({
          channelId: existingChannelId,
          participant: {
            id: recipient.id,
            displayName: recipient.displayName,
            avatarUrl: recipient.avatarUrl,
            x25519PublicKey: recipient.x25519PublicKey
              ? Buffer.from(recipient.x25519PublicKey).toString("base64")
              : "",
          },
        });
      }

      // Create new DM channel + two participants in a transaction
      const newChannelId = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(channels)
          .values({
            name: "", // DMs don't need a display name
            type: "dm",
            serverId: null,
            position: 0,
          })
          .returning({ id: channels.id });

        await tx.insert(dmParticipants).values([
          { channelId: inserted.id, userId },
          { channelId: inserted.id, userId: recipientUserId },
        ]);

        return inserted.id;
      });

      // Make both users' sockets join the channel room immediately
      await request.server.io?.to(`user:${userId}`).socketsJoin(`channel:${newChannelId}`);
      await request.server.io?.to(`user:${recipientUserId}`).socketsJoin(`channel:${newChannelId}`);

      return reply.code(201).send({
        channelId: newChannelId,
        participant: {
          id: recipient.id,
          displayName: recipient.displayName,
          avatarUrl: recipient.avatarUrl,
          x25519PublicKey: recipient.x25519PublicKey
            ? Buffer.from(recipient.x25519PublicKey).toString("base64")
            : "",
        },
      });
    },
  });
}
