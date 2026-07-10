import { WaiterSubcommandGroup } from "../../../lib/base/WaiterSubcommandGroup";
import Admin from "../../admin.cmd";

/** /admin drbot — manage the bot process itself (restart / update / logs). */
export default class AdminDrBotGroup extends WaiterSubcommandGroup {
  static parent = Admin;

  public name = "drbot";
  public description = "Manage the bot (restart / update / logs).";
}
