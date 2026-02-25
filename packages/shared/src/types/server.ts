// Server, channel, and member API response/request types

export const CHANNEL_TYPES = {
  TEXT: "text",
  VOICE: "voice",
  DM: "dm",
} as const;

export type ChannelType = (typeof CHANNEL_TYPES)[keyof typeof CHANNEL_TYPES];

export interface ServerResponse {
  id: string;
  name: string;
  ownerId: string;
  iconUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelResponse {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  topic: string | null;
  position: number;
  createdAt: string;
}

export interface ServerMemberResponse {
  id: string;
  serverId: string;
  userId: string;
  joinedAt: string;
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    status: string | null;
  };
}

export interface CreateServerRequest {
  name: string;
}

export interface UpdateServerRequest {
  name?: string;
}
