/** Technics-style 33⅓ RPM — Rekordbox/Serato default platter speed. */
export const VINYL_RPM = 100 / 3;

/** Seconds of track time for one full vinyl rotation at tempo 1. */
export const SECONDS_PER_VINYL_ROTATION = 60 / VINYL_RPM;

/** Vinyl rotation degrees per second of track playback at tempo 1. */
export const DEGREES_PER_TRACK_SECOND = 360 / SECONDS_PER_VINYL_ROTATION;

export function positionToRotationDeg(position: number, tempo = 1): number {
  return position * DEGREES_PER_TRACK_SECOND * tempo;
}

export function angleDeltaToSeekSeconds(deltaDeg: number): number {
  return (deltaDeg / 360) * SECONDS_PER_VINYL_ROTATION;
}

export function wrapAngleDelta(fromDeg: number, toDeg: number): number {
  let delta = toDeg - fromDeg;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}
