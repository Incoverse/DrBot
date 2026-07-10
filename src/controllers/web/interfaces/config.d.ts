declare global {
  interface WaiterConfig {
    /** Web-specific configuration options */
    web?: {
      /** The port on which the web server will run @default 9999 */
      port?: number;
    };
  }
}


export { };

