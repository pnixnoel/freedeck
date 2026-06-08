export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function valueFromVerticalPointer(opts: {
  clientY: number;
  rect: { top: number; height: number };
  min: number;
  max: number;
}): number {
  const { clientY, rect, min, max } = opts;
  const pct = 1 - (clientY - rect.top) / rect.height;
  return clamp(min + pct * (max - min), min, max);
}

export function valueFromHorizontalPointer(opts: {
  clientX: number;
  rect: { left: number; width: number };
  min: number;
  max: number;
}): number {
  const { clientX, rect, min, max } = opts;
  const pct = (clientX - rect.left) / rect.width;
  return clamp(min + pct * (max - min), min, max);
}

export function valueFromAngle(opts: { angleDeg: number; min: number; max: number }): number {
  const rotation = opts.angleDeg + 90;
  const normalized = clamp((rotation + 135) / 270, 0, 1);
  return opts.min + normalized * (opts.max - opts.min);
}

export function angleFromPointer(cx: number, cy: number, clientX: number, clientY: number): number {
  return (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
}
