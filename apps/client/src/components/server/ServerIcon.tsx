/**
 * ServerIcon.tsx — Individual server icon with pill indicator and morph animation
 *
 * Displays a colored circle with server initials. When selected, morphs to
 * rounded-square and shows a left-side pill indicator. Color is derived
 * deterministically from the server ID (stable across renames).
 */

import { useNavigate } from "react-router-dom";
import type { ServerResponse } from "@tether/shared";

// ============================================================
// Color derivation from server ID
// ============================================================

function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

// ============================================================
// ServerIcon
// ============================================================

interface ServerIconProps {
  server: ServerResponse;
  isSelected: boolean;
}

export default function ServerIcon({ server, isSelected }: ServerIconProps) {
  const navigate = useNavigate();

  const hue = stringToHue(server.id);
  const bg = `hsl(${hue}, 45%, 35%)`;
  const bgHover = `hsl(${hue}, 45%, 42%)`;

  // Up to 2 initials from server name words
  const initials = server.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  function handleClick() {
    navigate(`/servers/${server.id}`);
  }

  return (
    <div className="relative flex items-center" title={server.name}>
      {/* Left pill indicator — visible when selected */}
      <div
        className={`
          absolute -left-3 w-1 rounded-r-full bg-white
          transition-all duration-200
          ${isSelected ? "h-9 opacity-100" : "h-0 opacity-0"}
        `}
      />

      {/* Server icon button */}
      <button
        onClick={handleClick}
        className={`
          group w-12 h-12 flex items-center justify-center
          text-white font-bold text-sm select-none cursor-pointer
          transition-all duration-150 ease-out shrink-0
          ${isSelected ? "rounded-2xl" : "rounded-full hover:rounded-2xl"}
        `}
        style={{
          backgroundColor: bg,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = bgHover;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = bg;
        }}
        aria-label={server.name}
        aria-current={isSelected ? "page" : undefined}
      >
        {initials || "?"}
      </button>
    </div>
  );
}
