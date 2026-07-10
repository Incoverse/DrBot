declare global {
  interface WaiterConfig {
    dashboard?: {
      /** Session expiry duration in hours. @default 24 */
      sessionExpiryHours?: number;
    };
  }
}

export { };
