/**
 * ChannelsTab.tsx — Channel management in server settings
 *
 * Features:
 *   - List all channels grouped by type
 *   - Add new channel with name + type selector
 *   - Inline edit channel name
 *   - Delete channel
 *   - Up/down arrow buttons for reorder (accessibility alternative to drag-and-drop)
 */

import { useState } from "react";
import {
  useChannels,
  useCreateChannel,
  useUpdateChannel,
  useDeleteChannel,
  useReorderChannels,
} from "@/hooks/useChannels";
import type { ChannelResponse } from "@tether/shared";

// ============================================================
// Types
// ============================================================

interface ChannelsTabProps {
  serverId: string;
}

// ============================================================
// Channel row component
// ============================================================

interface ChannelRowProps {
  channel: ChannelResponse;
  serverId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ChannelRow({
  channel,
  serverId,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: ChannelRowProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(channel.name);

  const updateChannel = useUpdateChannel(serverId);
  const deleteChannel = useDeleteChannel(serverId);

  function handleSave() {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === channel.name) {
      setEditing(false);
      setEditName(channel.name);
      return;
    }
    updateChannel.mutate(
      { channelId: channel.id, name: trimmed },
      {
        onSuccess: () => setEditing(false),
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setEditing(false);
      setEditName(channel.name);
    }
  }

  return (
    <div className="flex items-center gap-2 bg-zinc-900/50 rounded-lg px-4 py-2.5 group">
      {/* Type badge */}
      <span
        className={`
          text-xs px-1.5 py-0.5 rounded font-medium shrink-0
          ${channel.type === "voice"
            ? "bg-green-600/20 text-green-400"
            : "bg-blue-600/20 text-blue-400"
          }
        `}
      >
        {channel.type === "voice" ? "Voice" : "Text"}
      </span>

      {/* Channel name — inline edit */}
      {editing ? (
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          maxLength={100}
          className="
            flex-1 px-2 py-1 rounded
            bg-zinc-800 border border-zinc-600
            text-zinc-100 text-sm
            focus:outline-none focus:border-cyan-500/60
          "
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex-1 text-left text-sm text-zinc-200 hover:text-zinc-100 truncate"
          title="Click to edit name"
        >
          {channel.name}
        </button>
      )}

      {/* Reorder buttons */}
      <button
        onClick={onMoveUp}
        disabled={!canMoveUp}
        className="
          p-1 rounded transition-colors
          text-zinc-500 hover:text-zinc-300 disabled:text-zinc-700 disabled:cursor-not-allowed
        "
        title="Move up"
        aria-label="Move up"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 14l5-5 5 5z" />
        </svg>
      </button>
      <button
        onClick={onMoveDown}
        disabled={!canMoveDown}
        className="
          p-1 rounded transition-colors
          text-zinc-500 hover:text-zinc-300 disabled:text-zinc-700 disabled:cursor-not-allowed
        "
        title="Move down"
        aria-label="Move down"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {/* Delete button */}
      <button
        onClick={() => deleteChannel.mutate(channel.id)}
        disabled={deleteChannel.isPending}
        className="
          p-1 rounded transition-colors
          text-zinc-500 hover:text-red-400 hover:bg-red-600/10
          disabled:opacity-50
        "
        title={`Delete ${channel.name}`}
        aria-label={`Delete ${channel.name}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>
    </div>
  );
}

// ============================================================
// ChannelsTab
// ============================================================

export default function ChannelsTab({ serverId }: ChannelsTabProps) {
  const { data: channels, isLoading } = useChannels(serverId);
  const createChannel = useCreateChannel(serverId);
  const reorderChannels = useReorderChannels(serverId);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"text" | "voice">("text");

  const textChannels = channels?.filter((c) => c.type === "text") ?? [];
  const voiceChannels = channels?.filter((c) => c.type === "voice") ?? [];

  function handleAddChannel(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    createChannel.mutate(
      { name: trimmed, type: newType },
      {
        onSuccess: () => setNewName(""),
      },
    );
  }

  function handleReorder(
    groupChannels: ChannelResponse[],
    otherChannels: ChannelResponse[],
    fromIndex: number,
    toIndex: number,
    isTextGroup: boolean,
  ) {
    const reordered = [...groupChannels];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const [newText, newVoice] = isTextGroup
      ? [reordered, otherChannels]
      : [otherChannels, reordered];

    const order = [
      ...newText.map((c, i) => ({ id: c.id, position: i })),
      ...newVoice.map((c, i) => ({ id: c.id, position: newText.length + i })),
    ];

    reorderChannels.mutate(order);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-zinc-100 mb-1">Channels</h2>
        <p className="text-sm text-zinc-400">
          Create, edit, reorder, and delete channels.
        </p>
      </div>

      {/* Add channel form */}
      <form
        onSubmit={handleAddChannel}
        className="flex flex-wrap gap-3 items-end bg-zinc-900/50 rounded-lg p-4"
      >
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-zinc-500 mb-1">
            Channel Name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="new-channel"
            maxLength={100}
            className="
              w-full px-3 py-2 rounded-lg
              bg-zinc-900 border border-zinc-700
              text-zinc-100 placeholder-zinc-500
              focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30
              transition-colors text-sm
            "
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Type</label>
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as "text" | "voice")}
            className="
              px-3 py-2 rounded-lg text-sm
              bg-zinc-900 border border-zinc-700
              text-zinc-100
              focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30
              transition-colors
            "
          >
            <option value="text">Text</option>
            <option value="voice">Voice</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={!newName.trim() || createChannel.isPending}
          className="
            px-4 py-2 rounded-lg text-sm font-medium transition-colors
            bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed
            text-white
          "
        >
          {createChannel.isPending ? "Creating..." : "Add Channel"}
        </button>
      </form>

      {createChannel.isError && (
        <p className="text-sm text-red-400">
          {createChannel.error instanceof Error
            ? createChannel.error.message
            : "Failed to create channel"}
        </p>
      )}

      {/* Channel list */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-12 rounded-lg bg-zinc-900/50 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          {/* Text channels */}
          {textChannels.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Text Channels
              </h3>
              {textChannels.map((channel, index) => (
                <ChannelRow
                  key={channel.id}
                  channel={channel}
                  serverId={serverId}
                  canMoveUp={index > 0}
                  canMoveDown={index < textChannels.length - 1}
                  onMoveUp={() =>
                    handleReorder(
                      textChannels,
                      voiceChannels,
                      index,
                      index - 1,
                      true,
                    )
                  }
                  onMoveDown={() =>
                    handleReorder(
                      textChannels,
                      voiceChannels,
                      index,
                      index + 1,
                      true,
                    )
                  }
                />
              ))}
            </div>
          )}

          {/* Voice channels */}
          {voiceChannels.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Voice Channels
              </h3>
              {voiceChannels.map((channel, index) => (
                <ChannelRow
                  key={channel.id}
                  channel={channel}
                  serverId={serverId}
                  canMoveUp={index > 0}
                  canMoveDown={index < voiceChannels.length - 1}
                  onMoveUp={() =>
                    handleReorder(
                      voiceChannels,
                      textChannels,
                      index,
                      index - 1,
                      false,
                    )
                  }
                  onMoveDown={() =>
                    handleReorder(
                      voiceChannels,
                      textChannels,
                      index,
                      index + 1,
                      false,
                    )
                  }
                />
              ))}
            </div>
          )}

          {textChannels.length === 0 && voiceChannels.length === 0 && (
            <p className="text-sm text-zinc-500 py-4">
              No channels yet. Create one above.
            </p>
          )}
        </>
      )}
    </div>
  );
}
