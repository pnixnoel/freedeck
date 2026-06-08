export const SEGMENT_COUNT = 28;

export function levelToLitSegments(level: number): number {
  const clamped = Math.max(0, Math.min(1, level));
  return Math.round(clamped * SEGMENT_COUNT);
}

export function segmentColor(
  index: number,
  lit: number,
): "green" | "lime" | "off" {
  if (index >= lit) return "off";
  const ratio = index / SEGMENT_COUNT;
  return ratio > 0.75 ? "lime" : "green";
}
