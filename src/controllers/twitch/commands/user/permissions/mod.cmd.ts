import type TwitchClient from "@/controllers/twitch/client";
import WaiterCommand, { type ChannelMessage } from "@/controllers/twitch/lib/base/WaiterCommand";
import { RequiresPermission, TwitchPermissions } from "@/controllers/twitch/lib/misc";


export default class ModCMD extends WaiterCommand {
  public override displayName = "Mod";
  public messageTrigger: RegExp = /^!mod\s+(?<username>\w+)$/;


  @RequiresPermission(TwitchPermissions.Broadcaster)
  public async exec(streamer: TwitchClient, message: ChannelMessage): Promise<any> {
    const username = this.getArgs(message, "username")!;
    const user = await this.bot.fetchUser(username);

    if (!user) {
      await this.bot.channel(streamer).sendMessage(`I couldn't find a user with the name "${username}"`, { replyTo: message });
      return
    }

    const isVIP = await streamer.channel().isVIP(user.id);

    if (isVIP) await streamer.channel().removeVIP(user.id);
    await streamer.channel().addMod(user.id).catch(async (err) => {
      this.logger.error(`Failed to add "${user?.display_name}" as a moderator:`, err);
      await this.bot.channel(streamer).sendMessage(`Failed to add "${user?.display_name}" as a moderator.`, { replyTo: message });
    })
  }
}