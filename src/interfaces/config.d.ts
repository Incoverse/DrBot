declare global {
  interface WaiterConfig {
    /** The public URL that points to this Waiter instance, used for constructing redirect URIs for authentication flows. @default "http://localhost:9999" */
    publicUrl?: string;
    /** Configuration options for hot reloading of controllers and commands. @default { enabled: false } */
    hotReload?: {
      /** Whether to enable hot reloading of controllers and commands. When enabled, changes to controller and command files will be automatically applied without needing to restart the application. @default false */
      enabled?: boolean;
    }
  }
}

export { };

