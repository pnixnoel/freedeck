import { describe, it, expect } from "vitest";
import { applyPitchBend, PITCH_BEND_RATIO } from "./pitchBend";

describe("applyPitchBend", () => {
  it("applies ±2% tempo bend", () => {
    expect(applyPitchBend(1.0, 1)).toBeCloseTo(1.0 + PITCH_BEND_RATIO, 5);
    expect(applyPitchBend(1.0, -1)).toBeCloseTo(1.0 - PITCH_BEND_RATIO, 5);
  });

  it("clamps bend to engine range 0.5–2.0", () => {
    expect(applyPitchBend(0.51, -1)).toBe(0.5);
    expect(applyPitchBend(1.99, 1)).toBe(2.0);
  });
});
