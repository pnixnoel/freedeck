const SNAP_THRESHOLD_RATIO = 0.04;

export function knobCenter(min: number, max: number): number {
  return (min + max) / 2;
}

export function snapToCenter(value: number, min: number, max: number): number {
  const center = knobCenter(min, max);
  const threshold = (max - min) * SNAP_THRESHOLD_RATIO;
  return Math.abs(value - center) <= threshold ? center : value;
}
