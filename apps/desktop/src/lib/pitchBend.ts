export const PITCH_BEND_RATIO = 0.02;

export function applyPitchBend(baseTempo: number, direction: -1 | 1): number {
  return Math.max(0.5, Math.min(2.0, baseTempo + direction * PITCH_BEND_RATIO));
}
