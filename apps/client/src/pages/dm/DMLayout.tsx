/**
 * DMLayout.tsx — DM section layout: sidebar + conversation area
 *
 * Structure (similar to ServerView):
 *   - Left sidebar (w-60): "Direct Messages" header + DMList
 *   - Right area (flex-1): Outlet for active DM conversation
 *   - No conversation selected: centered placeholder
 *
 * Nested under AppShell, so the server strip is still visible on the left.
 */

import { Outlet } from "react-router-dom";
import DMList from "./DMList";

// ============================================================
// DM placeholder (shown when no conversation is selected)
// ============================================================

function DMPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-zinc-500"
          >
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
        </div>
        <p className="text-zinc-400 text-sm font-medium">No conversation selected</p>
        <p className="text-zinc-600 text-xs mt-1">
          Select a conversation or start a new one
        </p>
      </div>
    </div>
  );
}

// ============================================================
// DMLayout
// ============================================================

export default function DMLayout() {
  return (
    <div className="flex h-full min-w-0">
      {/* DM sidebar */}
      <div className="w-60 shrink-0 flex flex-col bg-zinc-800 border-r border-zinc-700/40">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-700/60 shrink-0">
          <h2 className="text-zinc-100 font-bold text-sm">Direct Messages</h2>
        </div>

        {/* DM conversation list */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <DMList />
        </div>
      </div>

      {/* Conversation area */}
      <div className="flex-1 min-w-0 flex flex-col bg-zinc-850 overflow-hidden">
        <Outlet context={{}} />
      </div>
    </div>
  );
}
