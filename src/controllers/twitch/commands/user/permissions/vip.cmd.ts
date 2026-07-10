import type TwitchClient from "@/controllers/twitch/client";
import WaiterCommand, { type ChannelMessage } from "@/controllers/twitch/lib/base/WaiterCommand";
import { RequiresPermission, TwitchPermissions } from "@/controllers/twitch/lib/misc";


export default class VipCMD extends WaiterCommand {
  public override displayName = "VIP";
  public messageTrigger: RegExp = /^!vip\s+(?<username>\w+)$/;


  @RequiresPermission(TwitchPermissions.Moderator)
  public async exec(streamer: TwitchClient, message: ChannelMessage): Promise<any> {
    const username = this.getArgs(message, "username")!;
    const user = await this.bot.fetchUser(username);

    if (!user) {
      await this.bot.channel(streamer).sendMessage(`I couldn't find a user with the name "${username}"`, { replyTo: message });
      return
    }

    const isMod = await streamer.channel().isMod(user.id);

    if (isMod) await streamer.channel().removeMod(user.id);
    await streamer.channel().addVIP(user.id).catch(async (err) => {
      if (/unlock additional vip slots/i.test(err?.response?.data?.message)) {
        await this.bot.channel(streamer).sendMessage(`I couldn't add "${user.display_name}" as a VIP because the channel has reached the maximum number of VIPs.`, { replyTo: message });
      } else {
        this.logger.error(`Failed to add "${user.display_name}" as a VIP:`, err);
        await this.bot.channel(streamer).sendMessage(`Failed to add "${user.display_name}" as a VIP.`, { replyTo: message });
      }
    })
  }
}