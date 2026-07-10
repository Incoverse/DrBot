/// <reference lib="dom" />
import type { TemplateVarSchema } from "@/lib/overlay-template";

export const id = "spotify-now-playing";

export const variables = {} satisfies TemplateVarSchema;

interface TrackState {
  is_playing: boolean;
  progress_ms: number;
  timestamp?: number;
  item?: {
    name: string;
    duration_ms: number;
    artists?: Array<{ name: string }>;
    album?: {
      images?: Array<{ url: string; width: number; height: number }>;
    };
  };
}

interface TemplateAPI {
  playSound: (url: string, volume?: number) => Promise<void>;
  root: HTMLElement;
  untilUnrendered: () => Promise<void>;
  onUpdate: (cb: (vars: Record<string, unknown>) => void) => void;
  onSpotifyUpdate: (cb: (state: TrackState) => void) => void;
}

export async function exec(_vars: Record<string, unknown>, api: TemplateAPI): Promise<void> {
  const root = api.root;

  if (!document.getElementById("waiter-figtree-preconnect-1")) {
    const pre1 = document.createElement("link");
    pre1.id = "waiter-figtree-preconnect-1";
    pre1.rel = "preconnect";
    pre1.href = "https://fonts.googleapis.com";
    document.head.appendChild(pre1);

    const pre2 = document.createElement("link");
    pre2.rel = "preconnect";
    pre2.href = "https://fonts.gstatic.com";
    (pre2 as any).crossOrigin = "";
    document.head.appendChild(pre2);

    const fontLink = document.createElement("link");
    fontLink.id = "waiter-figtree-font";
    fontLink.rel = "stylesheet";
    fontLink.href = "https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,300..900;1,300..900&display=swap";
    document.head.appendChild(fontLink);
  }

  const FONT = `"Figtree", sans-serif`;

  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    flex-direction: row;
    gap: 38px;
    background-color: rgba(0,0,0,1);
    height: 384px;
    width: 1920px;
    border-radius: 38px;
    font-family: ${FONT};
    font-optical-sizing: auto;
    font-weight: 400;
    font-style: normal;
    opacity: 0;
    transition: opacity 0.4s ease;
    pointer-events: none;
  `;

  const albumImg = document.createElement("img");
  albumImg.style.cssText = `
    width: 307px;
    height: 307px;
    border-radius: 23px;
    margin: 38px;
    flex-shrink: 0;
    object-fit: cover;
    background: rgba(255,255,255,0.06);
    transition: opacity 0.3s ease;
  `;

  const trackInfo = document.createElement("div");
  trackInfo.style.cssText = `
    width: max-content;
    border-radius: 15px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
  `;

  const scrollContainer = document.createElement("div");
  scrollContainer.style.cssText = `
    position: relative;
    overflow: hidden;
    width: 1440px;
    height: 92px;
    display: flex;
    align-items: center;
  `;

  const trackName = document.createElement("span");
  trackName.style.cssText = `
    font-size: 69px;
    font-weight: bold;
    color: #ffffff;
    margin: 0;
    white-space: nowrap;
    display: inline-block;
    font-family: ${FONT};
  `;
  scrollContainer.appendChild(trackName);

  const artistName = document.createElement("p");
  artistName.style.cssText = `
    color: #9b9b9b;
    font-size: 50px;
    max-height: 2.4em;
    line-height: 1.2em;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    text-overflow: ellipsis;
    max-width: 1400px;
    margin: 0;
    font-family: ${FONT};
  `;

  const spacer = document.createElement("div");
  spacer.style.height = "38px";

  const progressBarContainer = document.createElement("div");
  progressBarContainer.style.cssText = `
    position: relative;
    width: 100%;
    height: 77px;
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  const progressBarBox = document.createElement("div");
  progressBarBox.style.cssText = `
    background-color: #333333;
    border-radius: 10px;
    position: relative;
    width: 100%;
    height: 19px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `;

  const progressBar = document.createElement("div");
  progressBar.style.cssText = `
    width: 0%;
    height: 19px;
    background-color: #fff;
    border-radius: 10px;
    transition: width 1s ease-in-out;
  `;
  progressBarBox.appendChild(progressBar);

  const timerRow = document.createElement("div");
  timerRow.style.cssText = `
    width: 100%;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: end;
    font-size: 31pt;
    font-family: ${FONT};
    color: #ffffff;
  `;

  const currentTimeEl = document.createElement("span");
  currentTimeEl.textContent = "0:00";

  const pausedEl = document.createElement("span");
  pausedEl.textContent = "Paused";
  pausedEl.style.cssText = `
    font-size: 28pt;
    color: gray;
    opacity: 0;
    transition: opacity 0.1s ease-in-out;
  `;

  const durationEl = document.createElement("span");
  durationEl.textContent = "0:00";

  timerRow.append(currentTimeEl, pausedEl, durationEl);
  progressBarContainer.append(progressBarBox, timerRow);

  trackInfo.append(scrollContainer, artistName, spacer, progressBarContainer);
  container.append(albumImg, trackInfo);
  root.appendChild(container);

  // ─── State ───────────────────────────────────────────────────────────────────

  let visible = false;
  let progressMs = 0;
  let durationMs = 0;
  let isPlaying = false;
  let lastTrackName = "";

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  }

  const ticker = setInterval(() => {
    if (durationMs <= 0) return;
    if (isPlaying) progressMs = Math.min(progressMs + 1000, durationMs);
    progressBar.style.width = `${(progressMs / durationMs) * 100}%`;
    currentTimeEl.textContent = formatTime(progressMs);
    durationEl.textContent = formatTime(durationMs);
    pausedEl.style.opacity = isPlaying ? "0" : "1";
  }, 1000);

  // ─── Show / Hide ─────────────────────────────────────────────────────────────

  function show() {
    if (visible) return;
    visible = true;
    container.style.opacity = "1";
  }

  function hide() {
    if (!visible) return;
    visible = false;
    container.style.opacity = "0";
  }

  // ─── Scroll animation ────────────────────────────────────────────────────────

  const SCROLL_SPEED = 60;
  const SCROLL_START_WAIT = 3000;
  const SCROLL_END_WAIT = 2000;
  const SCROLL_BACK_WAIT = 2000;

  let scrollAnimId: number | null = null;
  let scrollDir = 1;
  let scrollPaused = false;
  let shouldScroll = false;

  function resetScroll() {
    if (scrollAnimId !== null) { cancelAnimationFrame(scrollAnimId); scrollAnimId = null; }
    trackName.style.transform = "translateX(0px)";
    scrollDir = 1;
    scrollPaused = false;
    const cw = scrollContainer.offsetWidth;
    const tw = trackName.scrollWidth;
    if (tw <= cw) { shouldScroll = false; return; }
    setTimeout(startScroll, SCROLL_START_WAIT);
  }

  function startScroll() {
    const cw = scrollContainer.offsetWidth;
    const tw = trackName.scrollWidth;
    if (tw <= cw) { shouldScroll = false; return; }
    shouldScroll = true;
    let pos = 0;
    const maxScroll = tw - cw;
    let lastTs: number | null = null;

    function animate(ts: number) {
      if (!shouldScroll) return;
      if (!lastTs) lastTs = ts;
      const elapsed = (ts - lastTs) / 1000;
      lastTs = ts;
      if (!scrollPaused) {
        pos += scrollDir * SCROLL_SPEED * elapsed;
        if (pos < 0) pos = 0;
        if (pos > maxScroll) pos = maxScroll;
        trackName.style.transform = `translateX(${-pos}px)`;
      }
      if (scrollDir === 1 && pos >= maxScroll) {
        scrollPaused = true;
        setTimeout(() => {
          if (!shouldScroll) return;
          scrollDir = -1; scrollPaused = false; lastTs = null;
          scrollAnimId = requestAnimationFrame(animate);
        }, SCROLL_END_WAIT);
        return;
      } else if (scrollDir === -1 && pos <= 0) {
        scrollPaused = true;
        setTimeout(() => {
          if (!shouldScroll) return;
          scrollDir = 1; scrollPaused = false; lastTs = null;
          scrollAnimId = requestAnimationFrame(animate);
        }, SCROLL_BACK_WAIT);
        return;
      }
      scrollAnimId = requestAnimationFrame(animate);
    }
    scrollAnimId = requestAnimationFrame(animate);
  }

  // ─── State handler ───────────────────────────────────────────────────────────

  function applyState(state: TrackState) {
    const track = state.item;
    isPlaying = state.is_playing;
    durationMs = track?.duration_ms ?? 0;
    progressMs = !isPlaying
      ? (state.progress_ms ?? 0)
      : (state.progress_ms ?? 0) + (Date.now() - (state.timestamp ?? Date.now()));
    progressMs = Math.max(0, Math.min(progressMs, durationMs));

    if (!track) { hide(); return; }

    if (track.name !== lastTrackName) {
      lastTrackName = track.name;
      albumImg.style.opacity = "0";
      const img = track.album?.images?.find(i => i.width >= 60) ?? track.album?.images?.[0];
      if (img?.url) {
        albumImg.onload = () => { albumImg.style.opacity = "1"; };
        albumImg.src = img.url;
      } else {
        albumImg.src = "";
        albumImg.style.opacity = "1";
      }
      trackName.textContent = track.name;
      resetScroll();
    }

    artistName.textContent = track.artists?.map(a => a.name).join(", ") ?? "";
    show();
  }

  api.onSpotifyUpdate(applyState);

  await api.untilUnrendered();

  clearInterval(ticker);
  if (scrollAnimId !== null) cancelAnimationFrame(scrollAnimId);
  hide();
  await new Promise<void>(r => setTimeout(r, 600));
  root.removeChild(container);
}
