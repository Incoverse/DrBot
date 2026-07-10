import TableDefinition from "@/lib/base/tableDefinition";
import type { RecordId, SurrealTransaction } from "surrealdb";
import { registerMerger } from "./utils";

export default class SDBDefinitions extends TableDefinition {
  public static override priority = 0; // Always load first

  public static readonly USERS = `
    DEFINE TABLE OVERWRITE users SCHEMALESS;

    DEFINE FIELD OVERWRITE past_ids ON users TYPE array<string> DEFAULT [];
  `.trim();

  public static readonly STREAMER_TOKENS = `
    DEFINE TABLE OVERWRITE streamer_tokens SCHEMALESS;

    DEFINE FIELD OVERWRITE streamer ON streamer_tokens TYPE record<users>;
    DEFINE FIELD OVERWRITE auth ON streamer_tokens TYPE string; -- Encrypted
    DEFINE FIELD OVERWRITE type ON streamer_tokens TYPE "twitch" | "spotify" | "discord_spotify";

    -- Only one token per streamer per type
    DEFINE INDEX OVERWRITE unique_streamer_token ON TABLE streamer_tokens FIELDS streamer, type UNIQUE;
  `.trim();

  public static readonly WAITER_DATA = `
    DEFINE TABLE OVERWRITE waiter_data SCHEMALESS;

    DEFINE FIELD OVERWRITE machine_id ON waiter_data TYPE string; -- Unique identifier for the machine, used to make sure a Waiter instance doesn't collide with another in a DB
  `.trim();

  //? -- MERGERS --
  @registerMerger("streamer_tokens")
  private async mergeStreamerTokens(transaction: SurrealTransaction, fromUser: RecordId, toUser: RecordId) {
    const logger = console.withSender("MERGE").withPrefix(`[streamer_tokens]`);
    //! If there are tokens for fromUser, check if toUser already has tokens of the same type. If so, delete the fromUser tokens. If not, transfer the fromUser tokens to toUser by updating the streamer field to reference toUser instead of fromUser.
    
    const [fromTokens, toTokens] = await global.db.query(
      `SELECT * FROM streamer_tokens WHERE streamer = $fromUser;
       SELECT * FROM streamer_tokens WHERE streamer = $toUser;  `,
      { fromUser, toUser },
    ).collect() as any[];

    for (const fromToken of fromTokens) {
      const conflictingToToken = toTokens.find((t) => t.type === fromToken.type);
      if (conflictingToToken) {
        logger.debug(`Deleting token ${fromToken.id} for user ${fromUser} because of conflict with user ${toUser}`);
        await transaction.delete(fromToken.id);
      } else {
        logger.debug(`Transferring token ${fromToken.id} from user ${fromUser} to user ${toUser}`);
        await transaction.update(fromToken.id).merge({ streamer: toUser });
      }
    }
  }

  @registerMerger("users")
  private async mergeUsers(transaction: SurrealTransaction, fromUser: RecordId, toUser: RecordId) {
    // Get contents of fromUser, and apply everything to toUser that is not set in toUser. Then delete fromUser.
    const fromUserData = await global.db.query(
      `SELECT * FROM $fromUser`,
      { fromUser },
    ).collect().then(a=>a[0]![0]) as any;
    const toUserData = await global.db.query(
      `SELECT * FROM $toUser`,
      { toUser },
    ).collect().then(a=>a[0]![0]) as any;  

  
    await transaction.delete(fromUser);
    // TODO: Implement merger merging which allows for example the Discord module to merge its addons to "users", instead of having to hardcode them here.
    await transaction.update(toUser).merge({
      twitch: toUserData.twitch ?? fromUserData.twitch ?? null,
      discord: toUserData.discord ?? fromUserData.discord ?? null,
      spotify: toUserData.spotify ?? fromUserData.spotify ?? null,

      past_ids: Array.from(new Set([...(toUserData.past_ids ?? []), fromUser.id.toString(), ...(fromUserData.past_ids ?? [])])),
    });
  }
}

