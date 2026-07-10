import type TwitchClient from "@/controllers/twitch/client";
import WaiterCommand, { type ChannelMessage } from "@/controllers/twitch/lib/base/WaiterCommand";
import { RequiresPermission, TwitchPermissions } from "@/controllers/twitch/lib/misc";


export default class UnmodCMD extends WaiterCommand {
  public override displayName = "Unmod";
  public messageTrigger: RegExp = /^!unmod\s+(?<username>\w+)$/;


  @RequiresPermission(TwitchPermissions.Broadcaster)
  public async exec(streamer: TwitchClient, message: ChannelMessage): Promise<any> {
    const username = this.getArgs(message, "username")!;
    const user = await this.bot.fetchUser(username);

    if (!user) {
      await this.bot.channel(streamer).sendMessage(`I couldn't find a user with the name "${username}"`, { replyTo: message });
      return
    }

    const isMod = await streamer.channel().isMod(user.id);

    if (!isMod) {
      await this.bot.channel(streamer).sendMessage(`User "${user?.display_name}" is not a moderator.`, { replyTo: message });
      return
    }
    await streamer.channel().removeMod(user.id).catch(async (err) => {
      this.logger.error(`Failed to remove "${user?.display_name}" as a moderator:`, err);
      await this.bot.channel(streamer).sendMessage(`Failed to remove "${user?.display_name}" as a moderator.`, { replyTo: message });
    })
  }
}