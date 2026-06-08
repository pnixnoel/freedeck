export const KNOB_SWEEP_DEG = 270;

export function valueToNorm(value: number, min: number, max: number): number {
  return (value - min) / (max - min);
}

export function normToValue(norm: number, min: number, max: number): number {
  const clamped = Math.max(0, Math.min(1, norm));
  return min + clamped * (max - min);
}

export function angleDelta(fromDeg: number, toDeg: number): number {
  let d = toDeg - fromDeg;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function applyAngleDelta(opts: {
  startNorm: number;
  deltaDeg: number;
  min: number;
  max: number;
}): number {
  const deltaNorm = opts.deltaDeg / KNOB_SWEEP_DEG;
  return Math.max(0, Math.min(1, opts.startNorm + deltaNorm));
}
