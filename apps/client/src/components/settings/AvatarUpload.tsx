import { useRef, useCallback } from "react";
import { useAvatarUpload } from "@/hooks/useAvatarUpload";

interface AvatarUploadProps {
  /** Current avatar URL (null = show initials) */
  currentAvatarUrl: string | null;
  /** User's display name for initials fallback */
  displayName: string;
  /** Size in pixels */
  size?: number;
  /** Called with new avatarUrl after successful upload */
  onAvatarChange?: (avatarUrl: string) => void;
}

function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export default function AvatarUpload({
  currentAvatarUrl,
  displayName,
  size = 80,
  onAvatarChange,
}: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { previewUrl, status, error, uploadAvatar } = useAvatarUpload();

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const avatarUrl = await uploadAvatar(file);
      if (avatarUrl) {
        onAvatarChange?.(avatarUrl);
      }

      // Reset input for re-selection
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [uploadAvatar, onAvatarChange],
  );

  const hue = stringToHue(displayName);
  const initials = (displayName || "?")[0]?.toUpperCase() ?? "?";
  const avatarSrc = previewUrl || currentAvatarUrl;
  const isUploading = status === "resizing" || status === "uploading" || status === "updating";

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="relative group rounded-full overflow-hidden transition-opacity disabled:opacity-70"
        style={{ width: size, height: size }}
        aria-label="Change avatar"
      >
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: `hsl(${hue}, 45%, 35%)` }}
          >
            <span className="text-white font-bold" style={{ fontSize: size * 0.35 }}>
              {initials}
            </span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-zinc-950/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <svg width={size * 0.25} height={size * 0.25} viewBox="0 0 24 24" fill="currentColor" className="text-white">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </svg>
        </div>

        {/* Loading spinner overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-zinc-950/70 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {status === "done" && <p className="text-xs text-green-400">Avatar updated</p>}
    </div>
  );
}
