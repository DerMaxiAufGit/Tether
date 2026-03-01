interface TypingIndicatorProps {
  typingUsers: Array<{ userId: string; displayName: string }>;
}

export default function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  // Always reserve h-6 height to prevent layout shift
  if (typingUsers.length === 0) return <div className="h-6" />;

  const label =
    typingUsers.length === 1
      ? `${typingUsers[0].displayName} is typing`
      : typingUsers.length === 2
        ? `${typingUsers[0].displayName} and ${typingUsers[1].displayName} are typing`
        : `${typingUsers.length} people are typing`;

  return (
    <div className="flex items-center gap-1.5 px-4 py-1 text-xs text-zinc-400 h-6">
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce-dot"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}
