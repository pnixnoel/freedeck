export const TEMPO_MIN = 0.5;
export const TEMPO_MAX = 2.0;
export const DEFAULT_PHRASE_BARS = 4;
export const BEATS_PER_BAR = 4;

export type SyncAlignInput = {
  masterPosition: number;
  masterNativeBpm: number;
  masterTempo: number;
  masterGridOffset: number;
  followerPosition: number;
  followerNativeBpm: number;
  followerTempo: number;
  followerGridOffset: number;
  followerDuration: number;
  phraseBars?: number;
};

export type SyncAlignResult = {
  tempo: number;
  seekPosition: number;
};

export type ResolveMasterInput = {
  masterDeckOverride: 0 | 1 | null;
  playingA: boolean;
  playingB: boolean;
  lastAutoMaster: 0 | 1;
};

export function computeSyncTempo(input: {
  followerNativeBpm: number | null;
  followerTempo: number;
  masterNativeBpm: number | null;
  masterTempo: number;
}): number | null {
  const { followerNativeBpm, masterNativeBpm, masterTempo } = input;
  if (followerNativeBpm == null || masterNativeBpm == null) return null;
  if (followerNativeBpm <= 0 || masterNativeBpm <= 0) return null;
  const masterEffective = masterNativeBpm * masterTempo;
  const raw = masterEffective / followerNativeBpm;
  if (!Number.isFinite(raw)) return null;
  return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, raw));
}

export function canSync(
  followerNativeBpm: number | null,
  masterNativeBpm: number | null,
): boolean {
  return (
    followerNativeBpm != null &&
    masterNativeBpm != null &&
    followerNativeBpm > 0 &&
    masterNativeBpm > 0
  );
}

export function effectiveBpm(
  nativeBpm: number | null,
  tempo: number,
): number | null {
  if (nativeBpm == null || nativeBpm <= 0 || !Number.isFinite(tempo)) return null;
  const value = nativeBpm * tempo;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function isSynced(
  followerNativeBpm: number | null,
  followerTempo: number,
  masterNativeBpm: number | null,
  masterTempo: number,
  toleranceBpm = 0.5,
): boolean {
  if (!canSync(followerNativeBpm, masterNativeBpm)) return false;
  const follower = effectiveBpm(followerNativeBpm, followerTempo);
  const master = effectiveBpm(masterNativeBpm, masterTempo);
  if (follower == null || master == null) return false;
  return Math.abs(follower - master) <= toleranceBpm;
}

export function secondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

export function secondsPerBar(bpm: number): number {
  return secondsPerBeat(bpm) * BEATS_PER_BAR;
}

export function barIndex(position: number, gridOffset: number, secondsPerBarValue: number): number {
  if (secondsPerBarValue <= 0) return 0;
  return Math.floor((position - gridOffset) / secondsPerBarValue);
}

export function phrasePhase(barIndexValue: number, phraseBars = DEFAULT_PHRASE_BARS): number {
  return ((barIndexValue % phraseBars) + phraseBars) % phraseBars;
}

export function shortestPhraseDeltaBars(
  followerPhase: number,
  masterPhase: number,
  phraseBars = DEFAULT_PHRASE_BARS,
): number {
  let delta = masterPhase - followerPhase;
  if (delta > phraseBars / 2) delta -= phraseBars;
  if (delta < -phraseBars / 2) delta += phraseBars;
  return delta;
}

export function beatPhaseWithinBar(
  position: number,
  gridOffset: number,
  secondsPerBeatValue: number,
): number {
  if (secondsPerBeatValue <= 0) return 0;
  const beatsFromGrid = (position - gridOffset) / secondsPerBeatValue;
  const withinBar = beatsFromGrid % BEATS_PER_BAR;
  return ((withinBar % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
}

export function shortestBeatDelta(
  followerBeatPhase: number,
  masterBeatPhase: number,
): number {
  let delta = masterBeatPhase - followerBeatPhase;
  if (delta > BEATS_PER_BAR / 2) delta -= BEATS_PER_BAR;
  if (delta < -BEATS_PER_BAR / 2) delta += BEATS_PER_BAR;
  return delta;
}

export function clampSeek(position: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, position);
  return Math.max(0, Math.min(duration, position));
}

export function resolveMasterDeck(input: ResolveMasterInput): 0 | 1 {
  if (input.masterDeckOverride != null) return input.masterDeckOverride;
  if (input.playingA && !input.playingB) return 0;
  if (input.playingB && !input.playingA) return 1;
  return input.lastAutoMaster;
}

export function alignFollowerToMaster(input: SyncAlignInput): SyncAlignResult | null {
  const phraseBars = input.phraseBars ?? DEFAULT_PHRASE_BARS;
  const tempo = computeSyncTempo({
    followerNativeBpm: input.followerNativeBpm,
    followerTempo: input.followerTempo,
    masterNativeBpm: input.masterNativeBpm,
    masterTempo: input.masterTempo,
  });
  if (tempo == null) return null;

  const masterEffective = effectiveBpm(input.masterNativeBpm, input.masterTempo);
  const followerEffective = input.followerNativeBpm * tempo;
  if (masterEffective == null || followerEffective <= 0) return null;

  const masterSpb = secondsPerBar(masterEffective);
  const followerSpb = secondsPerBar(followerEffective);
  const followerSpbeat = secondsPerBeat(followerEffective);

  const masterBarIdx = barIndex(input.masterPosition, input.masterGridOffset, masterSpb);
  const followerBarIdx = barIndex(input.followerPosition, input.followerGridOffset, followerSpb);

  const masterPhrase = phrasePhase(masterBarIdx, phraseBars);
  const followerPhrase = phrasePhase(followerBarIdx, phraseBars);
  const deltaBars = shortestPhraseDeltaBars(followerPhrase, masterPhrase, phraseBars);

  let seekPosition = input.followerPosition + deltaBars * followerSpb;

  const masterBeatPhase = beatPhaseWithinBar(
    input.masterPosition,
    input.masterGridOffset,
    secondsPerBeat(masterEffective),
  );
  const followerBeatPhase = beatPhaseWithinBar(
    seekPosition,
    input.followerGridOffset,
    followerSpbeat,
  );
  const deltaBeats = shortestBeatDelta(followerBeatPhase, masterBeatPhase);
  seekPosition += deltaBeats * followerSpbeat;

  return {
    tempo,
    seekPosition: clampSeek(seekPosition, input.followerDuration),
  };
}

export function snapToBeat(position: number, gridOffset: number, spb: number): number {
  if (spb <= 0) return position;
  const beatsFromGrid = (position - gridOffset) / spb;
  const snappedBeats = Math.round(beatsFromGrid);
  return gridOffset + snappedBeats * spb;
}

export function snapToBar(position: number, gridOffset: number, spbar: number): number {
  if (spbar <= 0) return position;
  const barsFromGrid = (position - gridOffset) / spbar;
  const snappedBars = Math.round(barsFromGrid);
  return gridOffset + snappedBars * spbar;
}
