import { WaiterSubcommandGroup } from "../../../lib/base/WaiterSubcommandGroup";
import Admin from "../../admin.cmd";

/** /admin rules — manage the server rules. */
export default class AdminRulesGroup extends WaiterSubcommandGroup {
  static parent = Admin;

  public name = "rules";
  public description = "Manage the server rules.";
}
