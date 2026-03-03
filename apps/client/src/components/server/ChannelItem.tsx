/**
 * ChannelItem.tsx — Individual channel row with drag-and-drop support
 *
 * Uses @dnd-kit/sortable's useSortable hook. The entire item is the drag
 * handle (attributes + listeners spread on the outer div).
 *
 * For text channels: navigates to /servers/:serverId/channels/:channelId
 * For voice channels: triggers WebRTC join via useVoice AND navigates
 *
 * Voice channels show a participant sub-list below the channel name when
 * anyone is in the channel (visible to all server members, not just joiners).
 */

import { Link, useNavigate } from "react-router-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ChannelResponse } from "@tether/shared";
import { useChannelUnread } from "@/hooks/useUnread";
import { useVoice } from "@/contexts/VoiceContext";

// ============================================================
// Icons
// ============================================================

function TextChannelIcon() {
  return (
    <span className="text-zinc-400 text-base font-bold leading-none select-none">#</span>
  );
}

function VoiceChannelIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-zinc-400 shrink-0"
    >
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77 0-4.28-2.99-7.86-7-8.77z" />
    </svg>
  );
}

// ============================================================
// VoiceParticipantAvatar — colored initial circle (avatar-ready)
// ============================================================

function VoiceParticipantAvatar({
  displayName,
  userId,
  avatarUrl,
}: {
  displayName: string;
  userId: string;
  avatarUrl: string | null;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="w-5 h-5 rounded-full object-cover shrink-0"
      />
    );
  }

  const initial = displayName[0]?.toUpperCase() ?? "?";
  const COLORS = [
    "bg-indigo-600",
    "bg-violet-600",
    "bg-emerald-600",
    "bg-rose-600",
    "bg-amber-600",
    "bg-cyan-600",
    "bg-pink-600",
    "bg-teal-600",
  ];

  // Deterministic color from userId
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = COLORS[Math.abs(hash) % COLORS.length] ?? "bg-indigo-600";

  return (
    <div
      className={`w-5 h-5 rounded-full ${color} flex items-center justify-center shrink-0`}
    >
      <span className="text-white text-[9px] font-bold">{initial}</span>
    </div>
  );
}

// ============================================================
// ChannelItem
// ============================================================

interface ChannelItemProps {
  channel: ChannelResponse;
  isSelected: boolean;
}

export default function ChannelItem({ channel, isSelected }: ChannelItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: channel.id });

  const { unreadCount, hasMention } = useChannelUnread(channel.serverId, channel.id);
  const voice = useVoice();
  const navigate = useNavigate();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const href = `/servers/${channel.serverId}/channels/${channel.id}`;

  // Participants in this voice channel (from server broadcasts — all members see this)
  const voiceParticipants =
    channel.type === "voice"
      ? voice.voiceChannelParticipants.get(channel.id)
      : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {/* Main channel row */}
      <div
        className={`
          group flex items-center gap-1.5 px-2 py-1 rounded-md
          cursor-pointer select-none
          transition-colors duration-100
          ${isSelected
            ? "bg-zinc-600/60 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-700/40 hover:text-zinc-200"
          }
          ${isDragging ? "pointer-events-none" : ""}
        `}
      >
        {/* Channel type icon */}
        <span className="shrink-0 w-4 flex items-center justify-center">
          {channel.type === "voice" ? <VoiceChannelIcon /> : <TextChannelIcon />}
        </span>

        {/* Channel name — use Link for navigation but prevent default dnd conflicts */}
        <Link
          to={href}
          className={`
            flex-1 text-sm truncate
            ${isSelected
              ? "text-zinc-100 font-medium"
              : unreadCount > 0
                ? "text-zinc-100 font-semibold"
                : ""
            }
          `}
          onClick={(e) => {
            // Don't navigate if dragging
            if (isDragging) {
              e.preventDefault();
              return;
            }
            // Voice channels: trigger join via useVoice AND navigate
            if (channel.type === "voice" && channel.serverId) {
              e.preventDefault();
              voice.join(channel.id, channel.serverId);
              navigate(href);
            }
          }}
          // Prevent link from intercepting drag pointer events
          draggable={false}
          tabIndex={-1}
        >
          {channel.name}
        </Link>

        {/* Active voice indicator: show participant count for voice channels */}
        {channel.type === "voice" && voice.channelId === channel.id && (
          <span className="ml-auto shrink-0 text-[10px] font-medium text-emerald-400 px-1">
            {voice.participants.length}
          </span>
        )}

        {/* Unread badge — text channels only */}
        {channel.type === "text" && unreadCount > 0 && (
          <span
            className={`
              ml-auto shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full
              min-w-[18px] text-center leading-tight
              ${hasMention ? "bg-red-500 text-white" : "bg-zinc-600 text-zinc-200"}
            `}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>

      {/* Voice channel participant sub-list — visible to all server members */}
      {voiceParticipants && voiceParticipants.length > 0 && (
        <div className="ml-4 mt-0.5 space-y-0.5">
          {voiceParticipants.map((p) => (
            <div
              key={p.userId}
              className="flex items-center gap-2 px-2 py-0.5 rounded text-zinc-400 text-xs"
            >
              <VoiceParticipantAvatar
                displayName={p.displayName}
                userId={p.userId}
                avatarUrl={p.avatarUrl}
              />
              <span className="truncate">{p.displayName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
