// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import {
  CROSSFADER_POSITIONS,
  DEFAULT_CROSSFADER_BPM,
  SWEEP_BAR_OPTIONS,
  barsToDurationMs,
  clampCrossfader,
  isEditableTarget,
  lerpCrossfader,
  matchCrossfaderShortcut,
  resolveCrossfaderBpm,
  resolveSweepFromCurrent,
  resolveSweepBpm,
  sweepDurationMs,
  type CrossfaderShortcutAction,
} from "./crossfaderMotion";

function keyEvent(
  key: string,
  opts: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; target?: EventTarget | null } = {},
): KeyboardEvent {
  return {
    key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    target: opts.target ?? document.body,
  } as KeyboardEvent;
}

describe("barsToDurationMs", () => {
  it("converts 8 bars at 128 BPM to 15000ms", () => {
    expect(barsToDurationMs(8, 128)).toBe(15_000);
  });

  it("scales linearly with bar count", () => {
    expect(barsToDurationMs(4, 128)).toBe(7_500);
    expect(barsToDurationMs(16, 128)).toBe(30_000);
  });
});

describe("resolveCrossfaderBpm", () => {
  it("prefers playing deck A BPM adjusted by tempo", () => {
    expect(
      resolveCrossfaderBpm({
        bpmA: 120,
        bpmB: 140,
        tempoA: 1.1,
        tempoB: 1,
        playingA: true,
        playingB: false,
      }),
    ).toBeCloseTo(132);
  });

  it("falls back to playing deck B when A is not playing", () => {
    expect(
      resolveCrossfaderBpm({
        bpmA: 120,
        bpmB: 140,
        tempoA: 1,
        tempoB: 0.9,
        playingA: false,
        playingB: true,
      }),
    ).toBeCloseTo(126);
  });

  it("averages loaded decks when neither is playing", () => {
    expect(
      resolveCrossfaderBpm({
        bpmA: 120,
        bpmB: 140,
        tempoA: 1,
        tempoB: 1,
        playingA: false,
        playingB: false,
      }),
    ).toBe(130);
  });

  it("returns default when no BPM known", () => {
    expect(
      resolveCrossfaderBpm({
        bpmA: null,
        bpmB: null,
        tempoA: 1,
        tempoB: 1,
        playingA: false,
        playingB: false,
      }),
    ).toBe(DEFAULT_CROSSFADER_BPM);
  });
});

describe("resolveSweepBpm", () => {
  const base = {
    bpmA: 120,
    bpmB: 140,
    tempoA: 1,
    tempoB: 1,
    playingA: false,
    playingB: false,
  };

  it("sweep-left uses deck A effective BPM", () => {
    expect(resolveSweepBpm("sweep-left", base)).toBe(120);
  });

  it("sweep-right uses deck B effective BPM", () => {
    expect(resolveSweepBpm("sweep-right", base)).toBe(140);
  });

  it("falls back when target deck BPM unknown", () => {
    expect(resolveSweepBpm("sweep-left", { ...base, bpmA: null })).toBe(140);
  });

  it("8 bars at 120 BPM sweep-left = 16000ms", () => {
    expect(
      barsToDurationMs(
        8,
        resolveSweepBpm("sweep-left", base),
      ),
    ).toBe(16_000);
  });
});

describe("matchCrossfaderShortcut", () => {
  const cases: Array<[string, Partial<KeyboardEvent>, CrossfaderShortcutAction]> = [
    ["Cmd+Up → center", { key: "ArrowUp", metaKey: true }, "snap-center"],
    ["Ctrl+Up → center", { key: "ArrowUp", ctrlKey: true }, "snap-center"],
    ["Cmd+Shift+Left → left", { key: "ArrowLeft", metaKey: true, shiftKey: true }, "snap-left"],
    ["Cmd+Shift+Right → right", { key: "ArrowRight", metaKey: true, shiftKey: true }, "snap-right"],
    ["Left → sweep left", { key: "ArrowLeft" }, "sweep-left"],
    ["Right → sweep right", { key: "ArrowRight" }, "sweep-right"],
  ];

  it.each(cases)("%s", (_label, partial, expected) => {
    expect(matchCrossfaderShortcut(keyEvent(partial.key!, partial))).toBe(expected);
  });

  it("ignores plain ArrowUp", () => {
    expect(matchCrossfaderShortcut(keyEvent("ArrowUp"))).toBeNull();
  });

  it("ignores Cmd+Left without Shift", () => {
    expect(matchCrossfaderShortcut(keyEvent("ArrowLeft", { metaKey: true }))).toBeNull();
  });

  it("ignores when target is an input", () => {
    const input = document.createElement("input");
    expect(matchCrossfaderShortcut(keyEvent("ArrowLeft", { target: input }))).toBeNull();
  });
});

describe("resolveSweepFromCurrent", () => {
  it("sweep-right from 0.9 uses current position and 5% travel", () => {
    const result = resolveSweepFromCurrent(0.9, "sweep-right");
    expect(result.from).toBe(0.9);
    expect(result.to).toBe(1);
    expect(result.travelFraction).toBeCloseTo(0.05);
  });

  it("sweep-right from -0.5 uses 75% travel", () => {
    expect(resolveSweepFromCurrent(-0.5, "sweep-right")).toEqual({
      from: -0.5,
      to: 1,
      travelFraction: 0.75,
    });
  });

  it("sweep-right at full right is a no-op", () => {
    expect(resolveSweepFromCurrent(1, "sweep-right")).toEqual({
      from: 1,
      to: 1,
      travelFraction: 0,
    });
  });

  it("sweep-left from 0.9 uses 95% travel", () => {
    expect(resolveSweepFromCurrent(0.9, "sweep-left")).toEqual({
      from: 0.9,
      to: -1,
      travelFraction: 0.95,
    });
  });
});

describe("sweepDurationMs", () => {
  it("scales duration by travel fraction", () => {
    expect(sweepDurationMs(8, 128, 0.05)).toBe(750);
  });

  it("returns 0 when already at destination", () => {
    expect(sweepDurationMs(8, 128, 0)).toBe(0);
  });
});

describe("lerpCrossfader and clampCrossfader", () => {
  it("lerps linearly", () => {
    expect(lerpCrossfader(-1, 1, 0)).toBe(-1);
    expect(lerpCrossfader(-1, 1, 0.5)).toBe(0);
    expect(lerpCrossfader(-1, 1, 1)).toBe(1);
  });

  it("clamps to range", () => {
    expect(clampCrossfader(2)).toBe(1);
    expect(clampCrossfader(-2)).toBe(-1);
  });
});

describe("constants", () => {
  it("exports expected positions and bar options", () => {
    expect(CROSSFADER_POSITIONS).toEqual({ left: -1, center: 0, right: 1 });
    expect(SWEEP_BAR_OPTIONS).toEqual([2, 4, 8, 16, 32]);
  });
});
