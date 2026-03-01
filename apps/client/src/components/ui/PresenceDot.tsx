import type { PresenceStatus } from "@tether/shared";

const statusColors: Record<PresenceStatus, string> = {
  online:  "bg-green-500",
  idle:    "bg-yellow-400",
  dnd:     "bg-red-500",
  offline: "bg-zinc-500",
};

const statusLabels: Record<PresenceStatus, string> = {
  online:  "Online",
  idle:    "Idle",
  dnd:     "Do Not Disturb",
  offline: "Offline",
};

interface PresenceDotProps {
  status: PresenceStatus;
  size?: "sm" | "md";
}

export default function PresenceDot({ status, size = "md" }: PresenceDotProps) {
  const sizeClasses = size === "sm" ? "w-2.5 h-2.5 ring-[1.5px]" : "w-3 h-3 ring-2";

  return (
    <span
      className={`absolute bottom-0 right-0 rounded-full ring-zinc-800 ${sizeClasses} ${statusColors[status]}`}
      aria-label={statusLabels[status]}
      title={statusLabels[status]}
    />
  );
}

export type { PresenceStatus };
