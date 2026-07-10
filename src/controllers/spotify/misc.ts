export function queryize(obj: Record<string, any>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue; // Skip undefined values
    q.append(key, String(value));
  }

  if ([...q].length === 0) return ""; // No query parameters, return empty string

  return "?" + q.toString();
}

export function resolveId(idOrUri: string): string | null {
  // e.g https://open.spotify.com/playlist/37i9dQZF1Fx2BDqE9gjFJU?si=0a4cd7ef90574346&pt=431cfcf3029e6c44b38fb13d5442797a
  // e.g spotify:playlist:37i9dQZF1Fx2BDqE9gjFJU
  // should return spotify:playlist:37i9dQZF1Fx2BDqE9gjFJU
  const spotifyUriRegex = /^spotify:(\w+):(\w+)$/;
  const spotifyUrlRegex = /^https?:\/\/open\.spotify\.com\/(\w+)\/(\w+)/;

  let match = idOrUri.match(spotifyUriRegex);
  if (match) {
    return `spotify:${match[1]}:${match[2]}`;
  }

  match = idOrUri.match(spotifyUrlRegex);
  if (match) {
    return `spotify:${match[1]}:${match[2]}`;
  }

  // If it doesn't match either format, assume it's a raw ID and return as-is
  return null;

}