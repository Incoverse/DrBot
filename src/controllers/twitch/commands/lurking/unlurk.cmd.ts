/*
  * Copyright (c) 2026 Inimi | InimicalPart | Incoverse
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 3 of the License, or
  * (at your option) any later version.
  *
  * This program is distributed in the hope that it will be useful,
  * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  * GNU General Public License for more details.
  *
  * You should have received a copy of the GNU General Public License
  * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import { StreamerIsLive } from "../../lib/conditions";

export default class UnlurkCMD extends WaiterCommand {
  public override displayName = "Unlurk";
  public messageTrigger: RegExp = /^!unlurk/;

  public override async setup(clients: TwitchClient[]): Promise<boolean | null> {
    const streamers = clients.filter((client) => !client.isBot);

    for (const streamer of streamers) {
      if (!global.twitch.streamerData[streamer.IAM.id]?.lurkedUsers)
        global.twitch.streamerData[streamer.IAM.id] = {
          ...global.twitch.streamerData[streamer.IAM.id],
          lurkedUsers: []
        };
    }

    return super.setup(clients);
  }

  @StreamerIsLive()
  public override async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const user = await this.bot.fetchUser(message.chatter_user_id);

    if (!user) {
      return await this.bot.channel(channel).sendMessage("I couldn't find your user information. Please try again.", { replyTo: message});
    }

    if (!global.twitch.streamerData[channel.IAM.id]!.lurkedUsers?.some((u) => u.id === user.id)) {
      return await this.bot.channel(channel).sendMessage("You are not lurking!", { replyTo: message });
    }

    let messages = [
        "🎉 [Username] is back! Unlurk mode activated. Let the party begin!",
        "🦸‍♂️ [Username] swoops back in like a superhero. Chat saved!",
        "👀 [Username] emerges from the shadows. Did you miss them?",
        "🚪 [Username] kicks the door open and declares, 'I'm back!'",
        "💥 [Username] bursts out of lurk mode like a confetti cannon!",
        "🔔 Ding ding ding! [Username] has returned from their lurk adventures!",
        "🧙‍♂️ [Username] cast 'Unlurkio' and has reappeared in chat!",
        "🌟 [Username] is back and brighter than ever. Welcome to the spotlight!",
        "🐾 [Username] left some lurking paw prints but is back to play!",
        "🎩 Abracadabra! [Username] reappears from their magical lurk.",
        "🌄 [Username] rises from the lurking horizon like a glorious sunrise.",
        "🚶‍♂️ [Username] casually walks back in. Lurking break is over.",
        "🎵 Cue the fanfare! [Username] is back in the chat!",
        "🛡️ [Username] unsheathed their lurking shield and is ready to chat!",
        "📡 Signal restored! [Username] has returned from lurk orbit.",
        "🐉 [Username] roars back into chat after their dragon-like lurking slumber.",
        "🍪 [Username] finished their snack break and is back for action!",
        "🏆 [Username] wins the award for Best Return from Lurk!",
        "⚡ Lightning strikes, and [Username] is back in chat with full power!",
        "🧛‍♂️ [Username] rises from their lurking crypt. Beware, they're chatty now!",
        "🐸 [Username] leaps back into the chat pond. Ribbit and welcome back!",
        "🦄 [Username] gallops back into chat like a majestic unicorn.",
        "🚀 Houston, [Username] has landed back in chat!",
        "🎮 Player [Username] has respawned in chat. Let the games continue!",
        "🎭 The curtain lifts, and [Username] steps back into the spotlight!",
        "💡 Idea: [Username] is back, so let's get chatting!",
        "🦊 [Username] sneaks back into the chat like a clever fox.",
        "🌈 The pot of gold is here! [Username] has unlurked!",
        "🐾 [Username] followed their own lurking trail back to chat.",
        "🌌 The stars align, and [Username] returns from lurk orbit.",
        "📖 [Username] closed their lurking book and reopened their chat story.",
        "🐧 [Username] waddles back in from the icy lurk lands.",
        "🛬 Flight Unlurk-101 has landed. Welcome back, [Username]!",
        "🔓 [Username] unlocks the door to chat. Welcome home!",
        "🕶️ Coolly stepping back in, [Username] ends their lurk like a boss.",
        "🦥 [Username] stretches, yawns, and un-lurks in slow-motion glory.",
        "🎆 Fireworks explode as [Username] announces their triumphant return!",
        "🕊️ [Username] flies back in like a peaceful dove of conversation.",
        "🔭 [Username] was observing from afar but is now fully present.",
        "🏔️ [Username] descended from the lurking mountains. Welcome back!",
        "🧜‍♂️ [Username] swims back to chat like a curious merman.",
        "🛠️ Lurking break over! [Username] is back to fix the chat vibe.",
        "🎤 Mic check! [Username] has returned to the stage.",
        "🌟 A star has returned! [Username] shines bright in the chat.",
        "🍩 [Username] is back, probably with snacks. Share the donuts!",
        "🚦 Green light! [Username] is back in action.",
        "🐠 [Username] swims out of the lurking reef and into the chat current.",
        "📅 Mark the calendar: [Username] has officially unlurked today!",
        "🍷 Cheers! [Username] has emerged from the lurking lounge.",
        "🌟 [Username] un-lurked like a shooting star—blink and you'll miss them!",
        "🎈 Pop! [Username] bursts out of lurk mode with flair!",
        "🦁 [Username] roars back into chat after their silent safari.",
        "💃 [Username] dances back in like they never left. Unlurk mode = fabulous!",
        "🎵 The music stops and [Username] steps back into the chat rhythm!",
        "🦅 [Username] soars back into the chat nest. Welcome back!",
        "🔮 [Username] gazes into the chat crystal ball and steps out of the shadows.",
        "🌋 [Username] erupts from lurk mode like a volcano of energy!",
        "🍦 [Username] is back and they brought the sweetest vibes with them!",
        "🎲 Roll the dice! [Username] is back to spice up the chat.",
        "🏖️ [Username] returns from their lurking beach vacation. Tan lines optional!",
        "🛳️ All aboard! [Username] has docked back into chat.",
        "🐉 [Username] woke from their lurking dragon nap. Fire away!",
        "🗻 [Username] climbs out of the lurking mountains to join the chat party.",
        "🌌 A cosmic event! [Username] has returned to chat orbit.",
        "🎨 [Username] paints themselves back into the chat masterpiece.",
        "📡 Signal restored! [Username] is now back in full chat mode.",
        "🧗 [Username] scales the cliff of lurk and triumphantly returns!",
        "📦 Unboxing alert! [Username] is back and ready for action!",
        "🚂 The chat train has picked up [Username] from the Lurk Station.",
        "🍀 Lucky day! [Username] has returned from their lurking adventures.",
        "🐛 [Username] emerges from their lurking cocoon as a chat butterfly.",
        "🎇 Fireworks time! [Username] is back and brighter than ever.",
        "🌅 The sun rises and [Username] is back to shine on chat.",
        "🕶️ [Username] steps back in, cool and collected. Lurking is so last moment.",
        "🔦 [Username] turns on their chat flashlight and leaves the lurk cave.",
        "🐾 Follow the tracks! [Username] has made their way back to chat.",
        "🏹 Bullseye! [Username] un-lurked with precision.",
        "🧜‍♀️ [Username] surfaces from the lurking depths. Chat ahoy!",
        "🎂 Surprise! [Username] pops out of the lurking cake!",
        "🕰️ It's time! [Username] emerges from the lurking void.",
        "🌠 A shooting star! [Username] streaks back into chat.",
        "🐧 [Username] waddles back into chat with adorable vibes.",
        "🧙 Magic spell cast! [Username] has broken their lurking enchantment.",
        "🎤 Mic drop? No, mic pick-up! [Username] is back and ready to chat.",
        "🦖 [Username] stomps back into chat like a chat-osaur.",
        "🎮 [Username] just hit 'Resume' and is back in the game of chat.",
        "🛸 Close encounter! [Username] beams back into chat.",
        "🌊 A wave crashes and [Username] rides back into the chat tide.",
        "🐾 [Username] paws their way back into chat, tail wagging.",
        "📚 Bookmark saved! [Username] returns to their chat story.",
        "🍹 [Username] sips back into chat, cool drink in hand.",
        "🚴 [Username] pedals back into chat like a champion.",
        "🎢 [Username] is back from their lurking thrill ride!",
        "🧭 [Username] found their way back from lurk land!",
        "🪁 Up in the air, now on the ground—[Username] returns to chat.",
        "⚓ Anchors aweigh! [Username] is back to sail the chat seas.",
        "🐝 Buzz buzz! [Username] is back to pollinate the chat.",
        "🌲 [Username] emerges from the lurking forest with fresh vibes.",
        "🛸 [Username] touched down from their lurking UFO. Welcome to Earth chat!",
        "🔓 Unlocked and unleashed—[Username] is back in chat!"
    ]


    let msg = messages[Math.floor(Math.random() * messages.length)]!.replace(/\[Username\]/g, "@" + user.display_name);
    
    global.twitch.streamerData[channel.IAM.id]!.lurkedUsers = global.twitch.streamerData[channel.IAM.id]!.lurkedUsers?.filter(u => u.id !== user.id);
    
    await this.bot.channel(channel).sendMessage(msg);

  }

}