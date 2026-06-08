export function doubleBpm(bpm: number | null): number | null {
  if (bpm == null || bpm <= 0) return null;
  const next = bpm * 2;
  return next > 200 ? null : Math.round(next * 10) / 10;
}

export function halveBpm(bpm: number | null): number | null {
  if (bpm == null || bpm <= 0) return null;
  const next = bpm / 2;
  return next < 60 ? null : Math.round(next * 10) / 10;
}
