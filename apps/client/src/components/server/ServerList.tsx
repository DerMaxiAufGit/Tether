/**
 * ServerList.tsx — Vertical server icon strip (the Discord-style left rail)
 *
 * Layout (top to bottom):
 *   1. Home button (shows brand icon at rest, home icon on hover; navigates to /)
 *   2. Thin horizontal divider
 *   3. Scrollable server icon list (hidden scrollbar)
 *   4. "+" Add server button (opens CreateServerModal)
 *
 * Width: 72px fixed.
 * Background: zinc-900.
 */

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useServers } from "@/hooks/useServers";
import ServerIcon from "./ServerIcon";
import CreateServerModal from "./CreateServerModal";

// ============================================================
// Home button
// ============================================================

function HomeButton({ isActive }: { isActive: boolean }) {
  const navigate = useNavigate();

  return (
    <div className="relative flex items-center" title="Home">
      {/* Left pill indicator */}
      <div
        className={`
          absolute -left-3 w-1 rounded-r-full bg-white
          transition-all duration-200
          ${isActive ? "h-9 opacity-100" : "h-0 opacity-0"}
        `}
      />
      <button
        onClick={() => navigate("/")}
        className={`
          group w-12 h-12 flex items-center justify-center
          bg-zinc-800 hover:bg-cyan-600
          transition-all duration-200 shrink-0 cursor-pointer
          ${isActive ? "rounded-2xl bg-cyan-600" : "rounded-[50%] hover:rounded-2xl"}
        `}
        aria-label="Home"
        aria-current={isActive ? "page" : undefined}
      >
        {/* Icon container — both icons stacked, cross-fade on hover */}
        <span className="relative w-7 h-7">
          {/* Brand icon — visible at rest, fades out on hover / when active */}
          <img
            src="/assets/tether-icon.svg"
            alt=""
            draggable={false}
            className={`
              absolute inset-0 w-full h-full object-contain
              transition-[opacity,transform] duration-150
              ${isActive
                ? "opacity-0 scale-75"
                : "opacity-100 scale-100 group-hover:opacity-0 group-hover:scale-75"}
            `}
          />
          {/* Home icon — hidden at rest, fades in on hover / when active */}
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={`
              absolute inset-0 m-auto w-[22px] h-[22px] text-zinc-300
              transition-[opacity,transform] duration-150
              ${isActive
                ? "opacity-100 scale-100"
                : "opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100"}
            `}
          >
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        </span>
      </button>
    </div>
  );
}

// ============================================================
// Add server button
// ============================================================

function AddServerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="
        w-12 h-12 flex items-center justify-center
        rounded-[50%] hover:rounded-2xl
        bg-zinc-800 hover:bg-green-600
        border-2 border-dashed border-zinc-600 hover:border-transparent
        text-green-400 hover:text-white
        transition-all duration-200 shrink-0 cursor-pointer
      "
      title="Add a Server"
      aria-label="Add a Server"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
      </svg>
    </button>
  );
}

// ============================================================
// ServerList
// ============================================================

export default function ServerList() {
  const [modalOpen, setModalOpen] = useState(false);
  const { serverId: selectedServerId } = useParams<{ serverId: string }>();
  const { data: servers, isLoading } = useServers();

  const isHome = !selectedServerId;

  return (
    <>
      <nav
        className="
          w-[72px] h-full flex flex-col items-center
          py-3 gap-2
          bg-zinc-900 shrink-0
          overflow-hidden
        "
        aria-label="Servers"
      >
        {/* Home button — shows brand icon at rest, home icon on hover */}
        <HomeButton isActive={isHome} />

        {/* Divider */}
        <div className="w-8 h-px bg-zinc-700 my-1 shrink-0" />

        {/* Server list — scrollable, hidden scrollbar */}
        <div
          className="
            flex flex-col items-center gap-2
            flex-1 w-full overflow-y-auto px-3
            min-h-0
          "
          style={{ scrollbarWidth: "none" }}
        >
          {isLoading && (
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-12 h-12 rounded-full bg-zinc-700 animate-pulse shrink-0"
                />
              ))}
            </>
          )}

          {servers?.map((server) => (
            <ServerIcon
              key={server.id}
              server={server}
              isSelected={server.id === selectedServerId}
            />
          ))}

          {/* Add server button — flows after icons, scrolls with list */}
          <AddServerButton onClick={() => setModalOpen(true)} />
        </div>
      </nav>

      <CreateServerModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
