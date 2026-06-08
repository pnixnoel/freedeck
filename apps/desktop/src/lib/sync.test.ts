import { describe, it, expect } from "vitest";
import {
  alignFollowerToMaster,
  barIndex,
  canSync,
  clampSeek,
  computeSyncTempo,
  effectiveBpm,
  isSynced,
  phrasePhase,
  resolveMasterDeck,
  secondsPerBar,
  shortestPhraseDeltaBars,
} from "./sync";

describe("computeSyncTempo", () => {
  it("matches follower effective BPM to master", () => {
    expect(
      computeSyncTempo({
        followerNativeBpm: 120,
        followerTempo: 1,
        masterNativeBpm: 128,
        masterTempo: 1.05,
      }),
    ).toBeCloseTo(1.12, 2);
  });

  it("returns null when BPM unknown", () => {
    expect(
      computeSyncTempo({
        followerNativeBpm: null,
        followerTempo: 1,
        masterNativeBpm: 128,
        masterTempo: 1,
      }),
    ).toBeNull();
  });

  it("clamps to engine tempo range 0.5–2.0", () => {
    expect(
      computeSyncTempo({
        followerNativeBpm: 80,
        followerTempo: 1,
        masterNativeBpm: 170,
        masterTempo: 1,
      }),
    ).toBe(2.0);
  });
});

describe("canSync", () => {
  it("requires both decks to have native BPM", () => {
    expect(canSync(120, 128)).toBe(true);
    expect(canSync(null, 128)).toBe(false);
    expect(canSync(120, null)).toBe(false);
  });
});

describe("effectiveBpm", () => {
  it("multiplies native BPM by tempo ratio", () => {
    expect(effectiveBpm(120, 1.05)).toBeCloseTo(126, 5);
  });

  it("returns null when native BPM is unknown", () => {
    expect(effectiveBpm(null, 1)).toBeNull();
  });
});

describe("isSynced", () => {
  it("is true when effective BPMs match within tolerance", () => {
    expect(isSynced(120, 1.12, 128, 1.05)).toBe(true);
  });

  it("is false when tempos diverge", () => {
    expect(isSynced(120, 1, 128, 1)).toBe(false);
  });

  it("is false when BPM is missing", () => {
    expect(isSynced(null, 1, 128, 1)).toBe(false);
  });
});

describe("bar and phrase helpers", () => {
  it("computes seconds per bar for 120 BPM", () => {
    expect(secondsPerBar(120)).toBeCloseTo(2, 5);
  });

  it("computes bar index with offset", () => {
    const spb = secondsPerBar(120);
    expect(barIndex(2.5, 0.5, spb)).toBe(1);
  });

  it("computes phrase phase", () => {
    expect(phrasePhase(6, 4)).toBe(2);
    expect(phrasePhase(-1, 4)).toBe(3);
  });

  it("finds shortest phrase delta", () => {
    expect(shortestPhraseDeltaBars(3, 0, 4)).toBe(1);
    expect(shortestPhraseDeltaBars(1, 3, 4)).toBe(2);
  });
});

describe("resolveMasterDeck", () => {
  it("uses manual override when set", () => {
    expect(
      resolveMasterDeck({
        masterDeckOverride: 1,
        playingA: true,
        playingB: false,
        lastAutoMaster: 0,
      }),
    ).toBe(1);
  });

  it("prefers sole playing deck in auto mode", () => {
    expect(
      resolveMasterDeck({
        masterDeckOverride: null,
        playingA: false,
        playingB: true,
        lastAutoMaster: 0,
      }),
    ).toBe(1);
  });

  it("falls back to last auto master when both or neither play", () => {
    expect(
      resolveMasterDeck({
        masterDeckOverride: null,
        playingA: true,
        playingB: true,
        lastAutoMaster: 1,
      }),
    ).toBe(1);
  });
});

describe("alignFollowerToMaster", () => {
  const base = {
    masterNativeBpm: 120,
    masterTempo: 1,
    masterGridOffset: 0,
    followerNativeBpm: 120,
    followerTempo: 1,
    followerGridOffset: 0,
    followerDuration: 300,
    phraseBars: 4,
  };

  it("corrects 1-bar phase offset at same BPM", () => {
    const spb = secondsPerBar(120);
    const result = alignFollowerToMaster({
      ...base,
      masterPosition: spb * 2,
      followerPosition: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.tempo).toBeCloseTo(1, 5);
    expect(result!.seekPosition).toBeCloseTo(spb * 2, 3);
  });

  it("corrects 4-bar phrase mismatch", () => {
    const spb = secondsPerBar(120);
    const result = alignFollowerToMaster({
      ...base,
      masterPosition: 0,
      followerPosition: spb * 2,
    });
    expect(result).not.toBeNull();
    expect(result!.seekPosition).toBeCloseTo(0, 3);
  });

  it("respects non-zero grid offsets", () => {
    const spb = secondsPerBar(120);
    const offset = 0.5;
    const result = alignFollowerToMaster({
      ...base,
      masterGridOffset: offset,
      followerGridOffset: offset,
      masterPosition: offset + spb,
      followerPosition: offset,
    });
    expect(result).not.toBeNull();
    expect(result!.seekPosition).toBeCloseTo(offset + spb, 3);
  });

  it("clamps seek at track boundaries", () => {
    const spb = secondsPerBar(120);
    const result = alignFollowerToMaster({
      ...base,
      masterPosition: spb * 10,
      followerPosition: 0,
      followerDuration: spb,
    });
    expect(result!.seekPosition).toBeLessThanOrEqual(spb);
    expect(result!.seekPosition).toBeGreaterThanOrEqual(0);
  });

  it("matches tempo when BPM differs", () => {
    const result = alignFollowerToMaster({
      ...base,
      masterNativeBpm: 128,
      masterTempo: 1,
      followerNativeBpm: 120,
      masterPosition: 0,
      followerPosition: 0,
    });
    expect(result!.tempo).toBeCloseTo(128 / 120, 5);
  });
});

describe("clampSeek", () => {
  it("clamps to duration", () => {
    expect(clampSeek(50, 30)).toBe(30);
    expect(clampSeek(-5, 30)).toBe(0);
  });
});
