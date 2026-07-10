/**
 * Helpers for accessing Waiter global state from Next.js API routes.
 * Since Next.js runs in the same Node.js process as Waiter, we can access global.* directly.
 */

export function getWaiterGlobal<K extends keyof typeof globalThis>(key: K): (typeof globalThis)[K] {
  return (global as any)[key];
}

export function getTwitch(): any {
  return (global as any).twitch;
}

export function getDB(): any {
  return (global as any).db;
}

export function getConfig(): any {
  return (global as any).config;
}

export function getStreamers(): Map<string, any> {
  return getTwitch()?.streamers ?? new Map();
}

export function getStreamerById(id: string): any | null {
  return getStreamers().get(id) ?? null;
}

export function getBot(): any {
  return getTwitch()?.bot ?? null;
}

export function isWaiterReady(): boolean {
  return !!(getTwitch() && getDB()?.isConnected);
}

export function getCommandHandler(): any | null {
  try {
    const twitch = getTwitch();
    if (!twitch) return null;
    return (global as any).__commandHandler ?? null;
  } catch {
    return null;
  }
}

export function getRedemptionHandler(): any | null {
  try {
    return (global as any).__redemptionHandler ?? null;
  } catch {
    return null;
  }
}
