declare global {
  interface WaiterConfig {
    /** Database-specific configuration options */
    database?: {
      /** The URI of the SurrealDB server @default "wss://inimi.dev:13244" */
      uri?: string;
      /** Active database for SurrealDB. Uses the logged in user's username + '-test'. This should be changed to "main" when running production @default `${username}-test` */
      db?: string;
      /** Whether or not to ignore machine ID mismatches in the database. If this is true, the application will skip checking the machine ID in the database and overwrite it. If false, the application will refuse to operate on the database @default false */
      ignoreOwnerMismatch?: boolean;
    };
  }
}


export { };

