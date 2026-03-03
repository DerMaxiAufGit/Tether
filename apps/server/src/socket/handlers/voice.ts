import type { Socket, Server as SocketIOServer } from "socket.io";
import type { FastifyBaseLogger } from "fastify";
import type {
  VoiceJoinPayload,
  VoiceSignalPayload,
  VoiceIcePayload,
  VoiceMutePayload,
  VoiceDeafenPayload,
  VoiceCameraPayload,
  VoiceScreenSharePayload,
  VoiceSpeakingPayload,
  VoiceParticipant,
} from "@tether/shared";
import { redis } from "../../db/redis.js";
import { db } from "../../db/client.js";
import { channels, serverMembers, users } from "../../db/schema.js";
import { eq, and, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

const participantsKey = (channelId: string) => `voice:participants:${channelId}`;
const userChannelKey = (userId: string) => `voice:channel:${userId}`;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Execute the leave logic for a user leaving a voice channel.
 * Used by both voice:leave handler and disconnect cleanup.
 */
async function leaveVoiceChannel(
  socket: Socket,
  io: SocketIOServer,
  logger: FastifyBaseLogger,
  userId: string,
  channelId: string,
  serverId: string | null,
): Promise<void> {
  await redis.sRem(participantsKey(channelId), userId);
  await redis.del(userChannelKey(userId));
  socket.leave(`voice:${channelId}`);

  // Broadcast participant_left to voice room
  io.to(`voice:${channelId}`).emit("voice:participant_left", { channelId, userId });

  // Broadcast updated participant count to server room
  if (serverId) {
    const remainingCount = await redis.sCard(participantsKey(channelId));
    io.to(`server:${serverId}`).emit("voice:channel_update", {
      channelId,
      participantCount: remainingCount,
    });
  }

  logger.info({ userId, channelId }, "User left voice channel");
}

/**
 * Build a VoiceParticipant[] from a set of userIds, querying displayNames from DB.
 * All status flags default to false/0 — clients manage their own live state.
 */
async function buildParticipantList(userIds: string[]): Promise<VoiceParticipant[]> {
  if (userIds.length === 0) return [];

  const rows = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, userIds));

  // Preserve order from the Set (stable but arbitrary)
  const byId = new Map(rows.map((r) => [r.id, r.displayName]));
  return userIds
    .filter((id) => byId.has(id))
    .map((id) => ({
      userId: id,
      displayName: byId.get(id)!,
      muted: false,
      deafened: false,
      cameraOn: false,
      speaking: false,
      screenShareCount: 0,
    }));
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

export async function registerVoiceHandlers(
  socket: Socket,
  io: SocketIOServer,
  logger: FastifyBaseLogger,
): Promise<void> {
  const userId = socket.data.userId as string;

  // --------------------------------------------------------------------------
  // voice:join — join a voice channel
  // --------------------------------------------------------------------------
  socket.on("voice:join", async ({ channelId }: VoiceJoinPayload) => {
    try {
      // Verify channel exists and is type "voice"
      const [channel] = await db
        .select({ id: channels.id, serverId: channels.serverId, type: channels.type })
        .from(channels)
        .where(and(eq(channels.id, channelId), eq(channels.type, "voice")));

      if (!channel) {
        logger.warn({ userId, channelId }, "voice:join — channel not found or not a voice channel");
        return;
      }

      const serverId = channel.serverId;

      // Verify user is a member of this server
      if (serverId) {
        const [membership] = await db
          .select({ id: serverMembers.id })
          .from(serverMembers)
          .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)));

        if (!membership) {
          logger.warn({ userId, channelId, serverId }, "voice:join — user not a member of server");
          return;
        }
      }

      // If user is already in a different voice channel, auto-leave it first
      const existingChannelId = await redis.get(userChannelKey(userId));
      if (existingChannelId && existingChannelId !== channelId) {
        // Look up serverId for the old channel to update its count
        const [oldChannel] = await db
          .select({ serverId: channels.serverId })
          .from(channels)
          .where(eq(channels.id, existingChannelId));

        await leaveVoiceChannel(
          socket,
          io,
          logger,
          userId,
          existingChannelId,
          oldChannel?.serverId ?? null,
        );
      }

      // Track participation in Redis
      await redis.sAdd(participantsKey(channelId), userId);
      await redis.set(userChannelKey(userId), channelId);

      // Join the Socket.IO voice room
      await socket.join(`voice:${channelId}`);

      // Build current participant list (all users already in channel + self)
      const memberIds = await redis.sMembers(participantsKey(channelId));
      const participants = await buildParticipantList(memberIds);

      // Emit voice:joined to the joining socket with full participant list
      socket.emit("voice:joined", { channelId, participants });

      // Broadcast new participant to existing room members (exclude self)
      const selfParticipant: VoiceParticipant = {
        userId,
        displayName: participants.find((p) => p.userId === userId)?.displayName ?? "",
        muted: false,
        deafened: false,
        cameraOn: false,
        speaking: false,
        screenShareCount: 0,
      };
      socket.to(`voice:${channelId}`).emit("voice:participant_joined", {
        channelId,
        participant: selfParticipant,
      });

      // Broadcast updated participant count to server room
      if (serverId) {
        io.to(`server:${serverId}`).emit("voice:channel_update", {
          channelId,
          participantCount: memberIds.length,
        });
      }

      logger.info({ userId, channelId, participantCount: memberIds.length }, "User joined voice channel");
    } catch (err) {
      logger.error({ err, userId, channelId }, "voice:join handler error");
    }
  });

  // --------------------------------------------------------------------------
  // voice:leave — leave a voice channel
  // --------------------------------------------------------------------------
  socket.on("voice:leave", async ({ channelId }: VoiceJoinPayload) => {
    try {
      // Look up serverId for participant count broadcast
      const [channel] = await db
        .select({ serverId: channels.serverId })
        .from(channels)
        .where(eq(channels.id, channelId));

      await leaveVoiceChannel(socket, io, logger, userId, channelId, channel?.serverId ?? null);
    } catch (err) {
      logger.error({ err, userId, channelId }, "voice:leave handler error");
    }
  });

  // --------------------------------------------------------------------------
  // voice:offer — WebRTC offer relay
  // --------------------------------------------------------------------------
  socket.on("voice:offer", async (payload: VoiceSignalPayload) => {
    try {
      io.to(`user:${payload.to}`).emit("voice:offer", { ...payload, from: userId });
    } catch (err) {
      logger.error({ err, userId, to: payload.to }, "voice:offer handler error");
    }
  });

  // --------------------------------------------------------------------------
  // voice:answer — WebRTC answer relay
  // --------------------------------------------------------------------------
  socket.on("voice:answer", async (payload: VoiceSignalPayload) => {
    try {
      io.to(`user:${payload.to}`).emit("voice:answer", { ...payload, from: userId });
    } catch (err) {
      logger.error({ err, userId, to: payload.to }, "voice:answer handler error");
    }
  });

  // --------------------------------------------------------------------------
  // voice:ice — ICE candidate relay
  // --------------------------------------------------------------------------
  socket.on("voice:ice", async (payload: VoiceIcePayload) => {
    try {
      io.to(`user:${payload.to}`).emit("voice:ice", { ...payload, from: userId });
    } catch (err) {
      logger.error({ err, userId, to: payload.to }, "voice:ice handler error");
    }
  });

  // --------------------------------------------------------------------------
  // voice:mute — broadcast mute state to voice room
  // --------------------------------------------------------------------------
  socket.on("voice:mute", async ({ channelId, muted }: VoiceMutePayload) => {
    try {
      io.to(`voice:${channelId}`).emit("voice:mute", { userId, muted });
    } catch (err) {
      logger.error({ err, userId, channelId }, "voice:mute handler error");
    }
  });

  // --------------------------------------------------------------------------
  // voice:deafen — broadcast deafen state to voice room
  // --------------------------------------------------------------------------
  socket.on("voice:deafen", async ({ channelId, deafened }: VoiceDeafenPayload) => {
    try {
      io.to(`voice:${channelId}`).emit("voice:deafen", { userId, deafened });
    } catch (err) {
      logger.error({ err, userId, channelId }, "voice:deafen handler error");
    }
  });

  // --------------------------------------------------------------------------
  // voice:camera — broadcast camera state to voice room
  // --------------------------------------------------------------------------
  socket.on("voice:camera", async ({ channelId, cameraOn }: VoiceCameraPayload) => {
    try {
      io.to(`voice:${channelId}`).emit("voice:camera", { userId, cameraOn });
    } catch (err) {
      logger.error({ err, userId, channelId }, "voice:camera handler error");
    }
  });

  // --------------------------------------------------------------------------
  // voice:screen_share — broadcast screen share state to voice room
  // --------------------------------------------------------------------------
  socket.on(
    "voice:screen_share",
    async ({ channelId, screenShareCount, streamId, action }: VoiceScreenSharePayload) => {
      try {
        io.to(`voice:${channelId}`).emit("voice:screen_share", {
          userId,
          screenShareCount,
          streamId,
          action,
        });
      } catch (err) {
        logger.error({ err, userId, channelId }, "voice:screen_share handler error");
      }
    },
  );

  // --------------------------------------------------------------------------
  // voice:speaking — broadcast speaking state to voice room (exclude sender)
  // --------------------------------------------------------------------------
  socket.on("voice:speaking", async ({ channelId, speaking }: VoiceSpeakingPayload) => {
    try {
      socket.to(`voice:${channelId}`).emit("voice:speaking", { userId, speaking });
    } catch (err) {
      logger.error({ err, userId, channelId }, "voice:speaking handler error");
    }
  });

  // --------------------------------------------------------------------------
  // disconnect — clean up voice room participation
  // --------------------------------------------------------------------------
  socket.on("disconnect", async () => {
    try {
      // Read which voice channel (if any) this user was in
      const channelId = await redis.get(userChannelKey(userId));
      if (!channelId) return;

      // Look up serverId for participant count broadcast
      const [channel] = await db
        .select({ serverId: channels.serverId })
        .from(channels)
        .where(eq(channels.id, channelId));

      await leaveVoiceChannel(socket, io, logger, userId, channelId, channel?.serverId ?? null);
    } catch (err) {
      logger.error({ err, userId }, "voice disconnect cleanup error");
    }
  });
}
