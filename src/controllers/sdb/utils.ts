import { SurrealTransaction, type RecordId } from "surrealdb";

const mergers = new Map<string, (transaction: SurrealTransaction, fromUser: RecordId, toUser: RecordId) => any>();

export async function mergeFromTo(fromUser: RecordId, toUser: RecordId): Promise<RecordId> {

  const logger = console.withSender("SUDB");
  logger.info(`Starting merge of user ${fromUser} into user ${toUser}...`);

  const allTables = await global.db.query("INFO FOR DB").then((res) => (res[0] as any).tables);

  const transaction = await global.db.beginTransaction();

  for (const table of Object.keys(allTables).toSorted((a, b) => {
    if (a === "users") return 1;
    if (b === "users") return -1;
    return 0;
  })) {
    if (mergers.has(table)) {
      logger.debug(`Merging records in table ${table} using custom merger...`);
      const mergerFunc = mergers.get(table);
      if (mergerFunc) {
        await mergerFunc(transaction, fromUser, toUser);
      }
    }
  }

  await transaction.commit();

  logger.great(`Merge of user ${fromUser} into user ${toUser} completed.`);

  return toUser
}


export function registerMerger(table: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    mergers.set(table, descriptor.value);
  };
}