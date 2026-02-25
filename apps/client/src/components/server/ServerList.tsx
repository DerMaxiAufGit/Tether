/**
 * ServerList.tsx — Vertical server icon strip (the Discord-style left rail)
 *
 * Layout (top to bottom):
 *   1. Tether brand icon (links to home)
 *   2. Home/DM button (navigates to /)
 *   3. Thin horizontal divider
 *   4. Scrollable server icon list (hidden scrollbar)
 *   5. "+" Add server button (opens CreateServerModal)
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
          w-12 h-12 flex items-center justify-center
          bg-zinc-800 hover:bg-cyan-600
          transition-all duration-200 shrink-0
          ${isActive ? "rounded-2xl bg-cyan-600" : "rounded-full hover:rounded-2xl"}
        `}
        aria-label="Home"
        aria-current={isActive ? "page" : undefined}
      >
        {/* House icon */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-zinc-300"
        >
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
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
        rounded-full hover:rounded-2xl
        bg-zinc-800 hover:bg-green-600
        border-2 border-dashed border-zinc-600 hover:border-transparent
        text-green-400 hover:text-white
        transition-all duration-200 shrink-0 text-2xl font-light
      "
      title="Add a Server"
      aria-label="Add a Server"
    >
      +
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
        {/* Brand icon */}
        <div className="w-12 h-12 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center shrink-0 mb-1">
          <img
            src="/assets/tether-icon.svg"
            alt="Tether"
            className="w-7 h-7"
            draggable={false}
          />
        </div>

        {/* Home button */}
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
        </div>

        {/* Add server button */}
        <div className="shrink-0 px-3">
          <AddServerButton onClick={() => setModalOpen(true)} />
        </div>
      </nav>

      <CreateServerModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
