export const CROSSFADER_POSITIONS = { left: -1, center: 0, right: 1 } as const;
export const DEFAULT_CROSSFADER_BPM = 128;
export const SWEEP_BAR_OPTIONS = [2, 4, 8, 16, 32] as const;
export type SweepBarCount = (typeof SWEEP_BAR_OPTIONS)[number];

export type CrossfaderShortcutAction =
  | "snap-center"
  | "snap-left"
  | "snap-right"
  | "sweep-left"
  | "sweep-right";

export type ResolveCrossfaderBpmInput = {
  bpmA: number | null;
  bpmB: number | null;
  tempoA: number;
  tempoB: number;
  playingA: boolean;
  playingB: boolean;
};

const BEATS_PER_BAR = 4;

export function barsToDurationMs(bars: number, bpm: number): number {
  const safeBpm = bpm > 0 ? bpm : DEFAULT_CROSSFADER_BPM;
  return (bars * BEATS_PER_BAR * 60_000) / safeBpm;
}

export function resolveSweepBpm(
  action: "sweep-left" | "sweep-right",
  input: ResolveCrossfaderBpmInput,
): number {
  const effectiveA = input.bpmA != null ? input.bpmA * input.tempoA : null;
  const effectiveB = input.bpmB != null ? input.bpmB * input.tempoB : null;

  if (action === "sweep-left" && effectiveA != null) return effectiveA;
  if (action === "sweep-right" && effectiveB != null) return effectiveB;

  return resolveCrossfaderBpm(input);
}

export function resolveCrossfaderBpm(input: ResolveCrossfaderBpmInput): number {
  const effectiveA = input.bpmA != null ? input.bpmA * input.tempoA : null;
  const effectiveB = input.bpmB != null ? input.bpmB * input.tempoB : null;

  if (input.playingA && effectiveA != null) return effectiveA;
  if (input.playingB && effectiveB != null) return effectiveB;

  const known: number[] = [];
  if (effectiveA != null) known.push(effectiveA);
  if (effectiveB != null) known.push(effectiveB);
  if (known.length === 1) return known[0]!;
  if (known.length === 2) return (known[0]! + known[1]!) / 2;

  return DEFAULT_CROSSFADER_BPM;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function hasCommandModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

export function matchCrossfaderShortcut(event: KeyboardEvent): CrossfaderShortcutAction | null {
  if (isEditableTarget(event.target)) return null;

  const cmd = hasCommandModifier(event);
  const { key, shiftKey } = event;

  if (cmd && key === "ArrowUp" && !shiftKey) return "snap-center";
  if (cmd && shiftKey && key === "ArrowLeft") return "snap-left";
  if (cmd && shiftKey && key === "ArrowRight") return "snap-right";

  if (!cmd && !shiftKey && !event.altKey) {
    if (key === "ArrowLeft") return "sweep-left";
    if (key === "ArrowRight") return "sweep-right";
  }

  return null;
}

export function lerpCrossfader(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function clampCrossfader(value: number): number {
  return Math.max(CROSSFADER_POSITIONS.left, Math.min(CROSSFADER_POSITIONS.right, value));
}
