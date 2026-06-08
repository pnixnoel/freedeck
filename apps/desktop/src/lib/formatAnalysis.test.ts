import { describe, it, expect } from "vitest";
import { formatBpm, formatKey, formatPlayingBpm } from "./formatAnalysis";

describe("formatBpm", () => {
  it("returns -- when invalid", () => {
    expect(formatBpm(0, false)).toBe("--");
    expect(formatBpm(128, false)).toBe("--");
  });

  it("rounds to one decimal", () => {
    expect(formatBpm(128.04, true)).toBe("128");
    expect(formatBpm(87.55, true)).toBe("87.6");
  });
});

describe("formatPlayingBpm", () => {
  it("shows effective BPM and original when pitched", () => {
    expect(formatPlayingBpm(120, 1.05)).toEqual({
      playing: "126",
      native: "120",
    });
  });

  it("hides original BPM at unity tempo", () => {
    expect(formatPlayingBpm(128, 1)).toEqual({
      playing: "128",
      native: null,
    });
  });
});

describe("formatKey", () => {
  it("returns -- when invalid", () => {
    expect(formatKey("", false)).toBe("--");
  });

  it("trims valid keys", () => {
    expect(formatKey("  F#m  ", true)).toBe("F#m");
  });
});
