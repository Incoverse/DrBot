/*
 * `/mod offense` — subcommand group for offense management (list / view / revoke).
 *
 * The old bot's only `offense` subcommand was `transcript`, which was entirely about the appeal
 * system (dropped per scope). This group replaces it with the offense CRUD the moderation suite
 * actually needs without appeals.
 */

import { WaiterSubcommandGroup } from "../../lib/base/WaiterSubcommandGroup";
import Mod from "../mod.cmd";

export default class ModOffenseGroup extends WaiterSubcommandGroup {
  static parent = Mod;

  public name = "offense";
  public description = "Manage user offenses.";
}
