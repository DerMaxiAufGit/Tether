/**
 * NewMessagesButton.tsx — Floating "X new messages" pill button
 *
 * Appears at the bottom of the message list when the user is scrolled up
 * and new messages have arrived while they were scrolled up.
 * Clicking scrolls to the bottom and resets the counter.
 */

interface NewMessagesButtonProps {
  count: number;
  onClick: () => void;
}

export default function NewMessagesButton({ count, onClick }: NewMessagesButtonProps) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className="
        absolute bottom-4 left-1/2 -translate-x-1/2
        flex items-center gap-1.5
        px-4 py-1.5
        bg-zinc-800/90 backdrop-blur-sm
        text-zinc-100 text-sm font-medium
        rounded-full
        border border-zinc-600/50
        shadow-lg
        hover:bg-zinc-700/90 hover:border-zinc-500/50
        transition-all
        z-10
      "
      aria-live="polite"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="text-cyan-400 shrink-0"
      >
        <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
      </svg>
      {count} new {count === 1 ? "message" : "messages"}
    </button>
  );
}
