import { WaiterSubcommandGroup } from "../../../lib/base/WaiterSubcommandGroup";
import Admin from "../../admin.cmd";

/** /admin edit — edit a user's stored information (birthday / timezone) in the database. */
export default class AdminEditGroup extends WaiterSubcommandGroup {
  static parent = Admin;

  public name = "edit";
  public description = "Edit a user's stored information in the database.";
}
