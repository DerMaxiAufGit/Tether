/**
 * InviteModal.tsx — Quick invite creation modal
 *
 * Auto-generates a 24-hour invite link when opened.
 * Provides a copyable link for sharing.
 *
 * This is a quick-access modal from the channel panel header.
 * Full invite management (listing, revoking) is in server settings (02-06).
 */

import { useState, useEffect } from "react";
import { Dialog } from "radix-ui";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ============================================================
// Types
// ============================================================

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
}

// ============================================================
// InviteModal
// ============================================================

export default function InviteModal({
  open,
  onOpenChange,
  serverId,
}: InviteModalProps) {
  const [copied, setCopied] = useState(false);

  const createInvite = useMutation({
    mutationFn: () =>
      api.post<{ code: string }>(`/api/servers/${serverId}/invites`, {
        expiresIn: 86400, // 24 hours in seconds
        maxUses: null,    // unlimited
      }),
  });

  // Auto-create an invite when the modal opens
  useEffect(() => {
    if (open) {
      createInvite.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset state on close
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      createInvite.reset();
      setCopied(false);
    }
    onOpenChange(nextOpen);
  }

  const inviteCode = createInvite.data?.code;
  const inviteLink = inviteCode
    ? `${window.location.origin}/invite/${inviteCode}`
    : null;

  async function handleCopy() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-40" />
        <Dialog.Content
          className="
            fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
            z-50 w-full max-w-md
            bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700/50
            p-6 focus:outline-none
          "
        >
          {/* Header */}
          <div className="mb-5">
            <Dialog.Title className="text-xl font-bold text-zinc-100">
              Invite People
            </Dialog.Title>
            <Dialog.Description className="text-sm text-zinc-400 mt-1">
              Share this link to invite people to the server.
            </Dialog.Description>
          </div>

          {/* Invite link */}
          <div className="space-y-3">
            {createInvite.isPending && (
              <div className="flex items-center gap-2 text-sm text-zinc-400 py-2">
                <div className="w-4 h-4 border-2 border-zinc-600 border-t-indigo-400 rounded-full animate-spin shrink-0" />
                Generating invite link...
              </div>
            )}

            {createInvite.isError && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                Failed to generate invite link. Please try again.
              </p>
            )}

            {inviteLink && (
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="
                    flex-1 px-3 py-2 rounded-lg
                    bg-zinc-800 border border-zinc-700
                    text-zinc-300 text-sm
                    focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30
                    cursor-text select-all
                  "
                />
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className={`
                    px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0
                    ${copied
                      ? "bg-green-600 hover:bg-green-600 text-white"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white"
                    }
                  `}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            )}

            {inviteLink && (
              <p className="text-xs text-zinc-500">
                This link expires in 24 hours.
              </p>
            )}
          </div>

          {/* Close X button */}
          <Dialog.Close
            className="
              absolute top-4 right-4
              w-7 h-7 flex items-center justify-center
              rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700
              transition-colors text-lg leading-none
            "
            aria-label="Close"
          >
            ×
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
