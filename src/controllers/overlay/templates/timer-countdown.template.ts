/// <reference lib="dom" />
import type { TemplateVarSchema } from "@/lib/overlay-template";

export const id = "timer-countdown";

export const variables = {
  timerName:   { type: "string", required: false, default: "TIMER",     label: "Timer Name"  },
  remainingMs: { type: "number", required: true,                         label: "Remaining (ms)" },
  accentColor: { type: "string", required: false, default: "#9146ff",    label: "Accent Color" },
} satisfies TemplateVarSchema;

interface TemplateAPI {
  playSound: (url: string, volume?: number) => Promise<void>;
  root: HTMLElement;
  untilUnrendered: () => Promise<void>;
  onUpdate: (cb: (vars: Record<string, unknown>) => void) => void;
  onSpotifyUpdate: (cb: (state: unknown) => void) => void;
}

export async function exec(
  vars: { timerName: string; remainingMs: number; accentColor: string },
  api: TemplateAPI,
) {
  const { timerName, accentColor } = vars;

  const card = document.createElement("div");
  card.style.cssText = `
    position: absolute;
    top: -160px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(8, 8, 12, 0.88);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid ${accentColor}55;
    border-radius: 20px;
    padding: 14px 48px 20px;
    box-shadow: 0 0 0 1px ${accentColor}22, 0 0 48px ${accentColor}33, 0 16px 48px rgba(0,0,0,0.7);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 240px;
    transition: top 0.55s cubic-bezier(0.34, 1.4, 0.64, 1);
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    user-select: none;
  `;

  const labelEl = document.createElement("div");
  labelEl.textContent = (timerName || "TIMER").toUpperCase();
  labelEl.style.cssText = `
    color: ${accentColor};
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 4px;
    opacity: 0.85;
    max-width: 420px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `;

  const divider = document.createElement("div");
  divider.style.cssText = `
    width: 100%;
    height: 1px;
    background: linear-gradient(90deg, transparent, ${accentColor}88, transparent);
    margin: 6px 0 10px;
  `;

  const timeEl = document.createElement("div");
  timeEl.style.cssText = `
    color: #ffffff;
    font-size: 58px;
    font-weight: 900;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 24px ${accentColor}66;
    transition: transform 0.12s ease, text-shadow 0.12s ease, color 0.2s ease;
    letter-spacing: -1px;
  `;

  card.append(labelEl, divider, timeEl);
  api.root.appendChild(card);

  // ─── Countdown state ───────────────────────────────────────────────────────
  // Track an absolute target time so drift from interval jitter doesn't accumulate.
  let target = Date.now() + Math.max(0, vars.remainingMs);

  function format(ms: number): string {
    const total = Math.ceil(Math.max(0, ms) / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => (n < 10 ? "0" : "") + n;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function render() {
    const remaining = target - Date.now();
    timeEl.textContent = format(remaining);
    // Pulse red in the final 10 seconds.
    timeEl.style.color = remaining <= 10000 ? "#ff5252" : "#ffffff";
    return remaining;
  }

  render();

  // Resolves when the countdown reaches zero on its own.
  let reachedZero: () => void;
  const zeroReached = new Promise<void>((r) => { reachedZero = r; });

  const ticker = setInterval(() => {
    if (render() <= 0) {
      clearInterval(ticker);
      reachedZero();
    }
  }, 250);

  // React to extend/set: the server pushes a fresh remainingMs.
  api.onUpdate((updated) => {
    if (typeof updated.remainingMs === "number") {
      target = Date.now() + Math.max(0, updated.remainingMs);
      render();
    }
  });

  // slide in with spring overshoot
  await new Promise<void>((r) => setTimeout(r, 20));
  card.style.top = "20px";

  // Wait for either a natural finish or an external unrender (abort/finishEarly).
  await Promise.race([zeroReached, api.untilUnrendered()]);

  clearInterval(ticker);

  // Final pop on the zeroed-out time, then slide out.
  timeEl.textContent = "0:00";
  timeEl.style.transform = "scale(1.2)";
  timeEl.style.textShadow = `0 0 32px ${accentColor}cc, 0 0 64px ${accentColor}55`;
  await new Promise<void>((r) => setTimeout(r, 180));

  card.style.transition = "top 0.4s cubic-bezier(0.55, 0, 1, 0.45)";
  card.style.top = "-160px";
  await new Promise<void>((r) => setTimeout(r, 420));
  card.remove();
}
