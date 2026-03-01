export type PresenceStatus = "online" | "idle" | "dnd" | "offline";

export interface PresenceUpdateEvent {
  userId: string;
  status: PresenceStatus;
}

export interface PresenceSnapshotEvent {
  presenceMap: Record<string, PresenceStatus>;
}
