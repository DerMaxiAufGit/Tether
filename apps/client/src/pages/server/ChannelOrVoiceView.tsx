/**
 * ChannelOrVoiceView.tsx — Route component for /servers/:serverId/channels/:channelId
 *
 * Delegates to VoiceChannelView for voice channels or ChannelView for text channels.
 * Channel type is determined from the channels list via useChannels().
 */

import { useParams, useOutletContext } from "react-router-dom";
import { useChannels } from "@/hooks/useChannels";
import ChannelView from "./ChannelView";
import { VoiceChannelView } from "@/components/voice/VoiceChannelView";

interface OutletContext {
  serverId: string;
}

export default function ChannelOrVoiceView() {
  const { channelId } = useParams<{ channelId: string }>();
  const { serverId } = useOutletContext<OutletContext>();
  const { data: channels } = useChannels(serverId);

  if (!channelId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Channel not found</p>
      </div>
    );
  }

  const channel = channels?.find((c) => c.id === channelId);

  // While channels are loading, default to text view (will switch once loaded)
  if (channel?.type === "voice") {
    return <VoiceChannelView channelId={channelId} serverId={serverId} />;
  }

  return <ChannelView />;
}
