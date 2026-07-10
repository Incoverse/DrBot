declare global {
  interface WaiterConfig {
    /** Database-specific configuration options */
    manager: {
      github: {
        /** The GitHub personal access token for API authentication to retrieve the latest Waiter Manager releases */
        token: string;
        /** The repository where the latest Waiter Manager releases are stored @default { owner: "Incoverse", name: "WaiterManager" }*/
        repository?: {
          owner: string;
          name: string;
        }
      }
    };
  }
}


export { };

