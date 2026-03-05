/**
 * BansTab.tsx — View and manage server bans
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ServerResponse, BanResponse } from "@tether/shared";

interface BansTabProps {
  server: ServerResponse;
}

function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export default function BansTab({ server }: BansTabProps) {
  const queryClient = useQueryClient();

  const { data: bans, isLoading } = useQuery({
    queryKey: ["servers", server.id, "bans"],
    queryFn: () =>
      api
        .get<{ bans: BanResponse[] }>(`/api/servers/${server.id}/bans`)
        .then((d) => d.bans),
  });

  const unban = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/api/servers/${server.id}/bans/${userId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers", server.id, "bans"] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-100 mb-1">Bans</h2>
        <p className="text-sm text-zinc-400">
          {bans ? `${bans.length} banned user${bans.length !== 1 ? "s" : ""}` : "Loading..."}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-zinc-900/50 animate-pulse" />
          ))}
        </div>
      ) : !bans || bans.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4">No banned users.</p>
      ) : (
        <div className="space-y-1">
          {bans.map((ban) => {
            const hue = stringToHue(ban.userId);
            return (
              <div
                key={ban.id}
                className="flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-zinc-900/50 transition-colors"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `hsl(${hue}, 45%, 35%)` }}
                >
                  <span className="text-white text-sm font-bold">
                    {ban.user.displayName[0]?.toUpperCase() ?? "?"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-zinc-200">
                    {ban.user.displayName}
                  </span>
                  {ban.reason && (
                    <p className="text-xs text-zinc-500 truncate">
                      Reason: {ban.reason}
                    </p>
                  )}
                  <p className="text-xs text-zinc-600">
                    Banned {new Date(ban.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => unban.mutate(ban.userId)}
                  disabled={unban.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Unban
                </button>
              </div>
            );
          })}
        </div>
      )}

      {unban.isError && (
        <p className="text-sm text-red-400">
          {unban.error instanceof Error ? unban.error.message : "Failed to unban"}
        </p>
      )}
    </div>
  );
}
