import type Communication from "@/lib/communication";
import type TwitchClient from "@twitch/client";
import type { Counter } from "@twitch/commands/counter-mng.cmd";
import type { Timer } from "@twitch/commands/timer-mng.cmd";
import type TwitchController from "..";
import type { TwitchEventInfo } from "../lib/base/WaiterEvent";

declare global {
  var twitch: {
    /** The Twitch controller instance. */
    controller: TwitchController;
    /** The authentication to Twitch's API using an app access token, which is used for sending messages so we get the chat bot badge. */
    appAuth: TwitchAppAuth;
    /** The communication module for Twitch-related interactions. */
    communication: Communication;
    /** The Twitch bot client instance. */
    bot: TwitchClient;
    /** A map of Twitch clients, keyed by streamer ID. */
    streamers: Map<string, TwitchClient>;
    /** A volatile memory for storing Twitch-related data, such as streamer statuses and lurker information. */
    streamerData: {
      [streamerId: string]: Partial<{
        /** Whether the streamer is currently live. */
        isStreaming: boolean;
        /** Viewers who are currently lurking (viewing the stream without active participation). */
        lurkedUsers: { id: string; login: string; display_name: string }[];
        /** Twitch events that require affiliate/partner status and are waiting to be registered. */
        pendingAffiliateEvents: TwitchEventInfo[];
        /** A list of users who have been seen in the current stream session. */
        seenThisStream: Map<string, string>;
        /** Counters */
        counters: Map<string, Counter>;
        /** Timers */
        timers: Map<string, Timer>;
      }>;
    }
    /** Bypasses that are set by the Waiter developer. */
    bypasses: Set<Bypass>;
  }
}

export { };


type Bypass = 
  LiveBypass | SongRequestBypass;

type LiveBypass = {
  /** Skips all conditions that check if the streamer is live, allowing commands that require the streamer to be live to be used even when the streamer is offline. */
  type: "live";
  /** The ID of the streamer for whom the bypass is set. Can be "all" to bypass for all channels. */
  scope: string;
}


type SongRequestBypass = {
  /** Bypasses checks related to the song request system, allowing users to use song request commands even if they don't meet the usual requirements (e.g. if the RTGR is installed). This is useful for streamers who want to use the !play command for song requests instead of the RTGR, or for streamers who have the RTGR installed but want to allow users to use the !play command as well. */
  type: "songrequest";
  /** The ID of the streamer for whom the bypass is set. Can be "all" to bypass for all channels. */
  scope: string;
}
