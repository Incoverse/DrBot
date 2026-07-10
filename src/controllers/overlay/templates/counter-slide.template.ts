/// <reference lib="dom" />
import type { TemplateVarSchema } from "@/lib/overlay-template";

export const id = "counter-slide";

export const variables = {
  previousCount: { type: "number",  required: false, default: 0,           label: "Previous Count" },
  nextCount:     { type: "number",  required: true,                         label: "Next Count"     },
  label:         { type: "string",  required: false, default: "COUNTER",    label: "Label"          },
  accentColor:   { type: "string",  required: false, default: "#9146ff",    label: "Accent Color"   },
} satisfies TemplateVarSchema;

export async function exec(
  vars: { previousCount: number; nextCount: number; label: string; accentColor: string },
  api: { playSound: (url: string, volume?: number) => Promise<void>; root: HTMLElement },
) {
  const { previousCount, nextCount, label, accentColor } = vars;

  const card = document.createElement("div");
  card.style.cssText = `
    position: absolute;
    top: -140px;
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
    min-width: 200px;
    transition: top 0.55s cubic-bezier(0.34, 1.4, 0.64, 1);
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    user-select: none;
  `;

  const labelEl = document.createElement("div");
  labelEl.textContent = label.toUpperCase();
  labelEl.style.cssText = `
    color: ${accentColor};
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 4px;
    opacity: 0.85;
  `;

  const divider = document.createElement("div");
  divider.style.cssText = `
    width: 100%;
    height: 1px;
    background: linear-gradient(90deg, transparent, ${accentColor}88, transparent);
    margin: 6px 0 10px;
  `;

  const numberEl = document.createElement("div");
  numberEl.textContent = String(previousCount);
  numberEl.style.cssText = `
    color: #ffffff;
    font-size: 58px;
    font-weight: 900;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 24px ${accentColor}66;
    transition: transform 0.12s ease, text-shadow 0.12s ease;
    letter-spacing: -1px;
  `;

  card.append(labelEl, divider, numberEl);
  api.root.appendChild(card);

  // slide in with spring overshoot
  await new Promise<void>((r) => setTimeout(r, 20));
  card.style.top = "20px";
  await new Promise<void>((r) => setTimeout(r, 650));

  // count up (max 10 steps, then snap)
  const diff = nextCount - previousCount;
  const steps = Math.min(Math.abs(diff), 10);
  if (steps > 1) {
    const stepSize = diff / steps;
    for (let i = 1; i < steps; i++) {
      const interim = Math.round(previousCount + stepSize * i);
      numberEl.textContent = String(interim);
      await new Promise<void>((r) => setTimeout(r, 60));
    }
  }

  // final number pop
  numberEl.style.transform = "scale(1.25)";
  numberEl.style.textShadow = `0 0 32px ${accentColor}cc, 0 0 64px ${accentColor}55`;
  numberEl.textContent = String(nextCount);
  await api.playSound("https://waiter.inimi.dev/tick.mp3");

  await new Promise<void>((r) => setTimeout(r, 120));
  numberEl.style.transform = "scale(1)";
  numberEl.style.textShadow = `0 0 24px ${accentColor}66`;

  // hold
  await new Promise<void>((r) => setTimeout(r, 1400));

  // slide out (sharper easing out)
  card.style.transition = "top 0.4s cubic-bezier(0.55, 0, 1, 0.45)";
  card.style.top = "-140px";
  await new Promise<void>((r) => setTimeout(r, 420));
  card.remove();
}
