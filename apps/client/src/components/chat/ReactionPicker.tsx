/**
 * ReactionPicker.tsx — Emoji picker in a Radix Popover
 *
 * Uses emoji-mart for the full picker with dark theme.
 * Trigger is passed as a child so the parent controls the button appearance.
 */

import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { Popover } from "radix-ui";
import type { ReactNode } from "react";

interface ReactionPickerProps {
  /** Called with the selected emoji character (e.g. "👍") */
  onReact: (emoji: string) => void;
  /** The element that triggers the picker popover */
  trigger: ReactNode;
}

export function ReactionPicker({ onReact, trigger }: ReactionPickerProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Picker
            data={data}
            theme="dark"
            onEmojiSelect={(emoji: { native: string }) => onReact(emoji.native)}
            previewPosition="none"
            skinTonePosition="none"
            perLine={8}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
