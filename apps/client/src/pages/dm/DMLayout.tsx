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
