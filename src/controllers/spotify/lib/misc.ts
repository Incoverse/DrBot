import type SpotifyClient from "../client";

export function getSpotifyClient(wuId: string): SpotifyClient {
  return global.spotify.clients.values().find(client => client.waiterUserId === wuId);
}