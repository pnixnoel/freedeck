import { clamp } from "./pointerValue";

export type TempoRange = "6" | "10" | "16" | "wide";

export const RANGE_LIMITS: Record<TempoRange, { min: number; max: number; label: string }> = {
  "6": { min: 0.94, max: 1.06, label: "±6%" },
  "10": { min: 0.9, max: 1.1, label: "±10%" },
  "16": { min: 0.84, max: 1.16, label: "±16%" },
  wide: { min: 0.5, max: 2.0, label: "WIDE" },
};

/** Map vertical pointer position to DJ tempo ratio (center = 1.0 for ± ranges). */
export function tempoFromVerticalPointer(opts: {
  clientY: number;
  rect: { top: number; height: number };
  range: TempoRange;
}): number {
  const { clientY, rect, range } = opts;
  const pct = 1 - (clientY - rect.top) / rect.height;
  const t = clamp(pct, 0, 1);
  const { min, max } = RANGE_LIMITS[range];

  if (range === "wide") {
    return clamp(min + t * (max - min), min, max);
  }

  const halfSpan = max - 1;
  if (t >= 0.5) {
    return clamp(1 + (t - 0.5) * 2 * halfSpan, min, max);
  }
  return clamp(1 - (0.5 - t) * 2 * halfSpan, min, max);
}

/** Map tempo ratio to fader position percent (0–100, bottom–top). */
export function tempoToFaderPercent(tempo: number, range: TempoRange): number {
  const { min, max } = RANGE_LIMITS[range];

  if (range === "wide") {
    return ((tempo - min) / (max - min)) * 100;
  }

  const halfSpan = max - 1;
  if (tempo >= 1) {
    return (0.5 + (tempo - 1) / (2 * halfSpan)) * 100;
  }
  return (0.5 - (1 - tempo) / (2 * halfSpan)) * 100;
}

export function clampTempoToRange(tempo: number, range: TempoRange): number {
  const { min, max } = RANGE_LIMITS[range];
  return clamp(tempo, min, max);
}

export function pitchAdjustPercent(tempo: number): number {
  return (tempo - 1) * 100;
}
