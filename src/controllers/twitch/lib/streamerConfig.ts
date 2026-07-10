import { RecordId } from "surrealdb";
import type TwitchClient from "../client";


export type StreamerConfigRecord = {
  streamer: RecordId;
  key: string;
  value: any;
}



export default class StreamerConfig {
  private constructor(public streamer: TwitchClient, private data: StreamerConfigRecord[]) {
    return new Proxy(this, {
      get(target, prop, receiver) {
        return target.data.find((record) => record.key === prop)?.value ?? Reflect.get(target, prop, receiver) ?? null;
      },
      set(target, prop, value, receiver) {
        if (typeof prop === "string") {
          const existingRecord = target.data.find((record) => record.key === prop);
          if (existingRecord) {
            if (value == undefined) {
              target.data = target.data.filter((record) => record.key !== prop);
            } else {
              existingRecord.value = value;
            }
          } else {

            if (value != undefined) { 
              target.data.push({
                streamer: new RecordId(`users`, target.streamer.waiterUserId), // Use existing streamer ID if available, otherwise create a new one
                key: prop,
                value: value,
              });
            }
          }
        }

        if (value == undefined) {
          global.db.query(
            `DELETE FROM streamer_config WHERE streamer = $streamer AND key = $key;`,
            {
              streamer: new RecordId(`users`, target.streamer.waiterUserId), // Use existing streamer ID if available, otherwise create a new one
              key: String(prop),
            }
          ).then(() => {
            target.streamer.logger.debug(`Deleted streamer config key '${String(prop)}' for streamer ${target.streamer.IAM.login}`);  
          }).catch((err) => {
            target.streamer.logger.error(`Failed to delete streamer config key '${String(prop)}' for streamer ${target.streamer.IAM.login}:`, err);
          });
          return true;
        }

        global.db.query(
          `UPSERT streamer_config SET streamer = $streamer, key = $key, value = $value WHERE streamer = $streamer AND key = $key;`,
          {
            streamer: new RecordId(`users`, target.streamer.waiterUserId), // Use existing streamer ID if available, otherwise create a new one
            key: prop,
            value: value
          }
        ).then(() => {
          target.streamer.logger.debug(`Set streamer config key '${String(prop)}' to '${value}' for streamer ${target.streamer.IAM.login}`);
        }).catch((err) => {
          target.streamer.logger.error(`Failed to set streamer config key '${String(prop)}' to '${value}' for streamer ${target.streamer.IAM.login}:`, err);
        });
        return true;
      }
    });
  }

  public static async load(streamer: TwitchClient): Promise<StreamerConfig> {

    const results = await global.db.query(`SELECT * FROM streamer_config WHERE streamer = $streamer`, { streamer: new RecordId(`users`, streamer.waiterUserId) }).then((res) => res[0]) as StreamerConfigRecord[];
    
    streamer.logger.debug(`Loaded streamer config for streamer ${streamer.IAM.login}. Records found: ${results.length}`);

    return new StreamerConfig(streamer, results);
  }

  [key: string]: any; // Allow dynamic keys with any values
}