import { WaiterSubcommandGroup } from "../../../lib/base/WaiterSubcommandGroup";
import Admin from "../../admin.cmd";

/** /admin entry — manage member entry (membership) records in the database. */
export default class AdminEntryGroup extends WaiterSubcommandGroup {
  static parent = Admin;

  public name = "entry";
  public description = "Manage member entry records in the database.";
}
