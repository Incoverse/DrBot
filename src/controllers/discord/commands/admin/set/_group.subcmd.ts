import { WaiterSubcommandGroup } from "../../../lib/base/WaiterSubcommandGroup";
import Admin from "../../admin.cmd";

/** /admin set — enable/disable and configure Waiter systems (e.g. the ticketing system). */
export default class AdminSetGroup extends WaiterSubcommandGroup {
  static parent = Admin;

  public name = "set";
  public description = "Enable/disable and configure Waiter systems.";
}
