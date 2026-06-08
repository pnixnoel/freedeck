export function formatBpm(bpm: number, valid: boolean): string {
  if (!valid || !Number.isFinite(bpm) || bpm <= 0) return "--";
  const rounded = Math.round(bpm * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatPlayingBpm(
  nativeBpm: number | null,
  tempo: number,
): { playing: string; native: string | null } {
  if (nativeBpm == null || nativeBpm <= 0) {
    return { playing: "--", native: null };
  }
  const playing = formatBpm(nativeBpm * tempo, true);
  const pitched = Math.abs(tempo - 1) > 0.001;
  return {
    playing,
    native: pitched ? formatBpm(nativeBpm, true) : null,
  };
}

export function formatKey(key: string, valid: boolean): string {
  if (!valid || !key.trim()) return "--";
  return key.trim();
}
