export const CENTER_NEEDLE_DEG = -90;
const SWEEP = 270;

/** Map normalized knob value to SVG math angle (0° = 3 o'clock, 12 o'clock = -90°). */
export function valueToNeedleDeg(norm: number): number {
  return norm * SWEEP - 225;
}

export function describeArc(centerNorm: number, valueNorm: number) {
  const startDeg = valueToNeedleDeg(centerNorm);
  const endDeg = valueToNeedleDeg(valueNorm);
  const largeArc = Math.abs(endDeg - startDeg) > 135 ? 1 : 0;
  const sweepFlag = valueNorm >= centerNorm ? 1 : 0;
  return { startDeg, endDeg, largeArc, sweepFlag };
}

export function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  sweep: 0 | 1,
): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = Math.abs(endDeg - startDeg) > 135 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
}

export function fullTrackPath(cx: number, cy: number, r: number): string {
  const start = valueToNeedleDeg(0);
  const end = valueToNeedleDeg(1);
  return arcPath(cx, cy, r, start, end, 1);
}
