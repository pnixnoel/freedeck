import { describe, it, expect } from "vitest";
import {
  clampTempoToRange,
  pitchAdjustPercent,
  tempoFromVerticalPointer,
  tempoToFaderPercent,
} from "./tempoColumn";

describe("tempoColumn", () => {
  const rect = { top: 0, height: 100 };

  it("maps center pointer to 1.0 for ±16% range", () => {
    expect(tempoFromVerticalPointer({ clientY: 50, rect, range: "16" })).toBeCloseTo(1.0, 3);
  });

  it("maps top pointer to max for ±16% range", () => {
    expect(tempoFromVerticalPointer({ clientY: 0, rect, range: "16" })).toBeCloseTo(1.16, 3);
  });

  it("maps bottom pointer to min for ±16% range", () => {
    expect(tempoFromVerticalPointer({ clientY: 100, rect, range: "16" })).toBeCloseTo(0.84, 3);
  });

  it("round-trips tempo to fader percent at center", () => {
    expect(tempoToFaderPercent(1.0, "16")).toBeCloseTo(50, 1);
  });

  it("shows pitch adjustment as deviation from 100%", () => {
    expect(pitchAdjustPercent(1.06)).toBeCloseTo(6, 3);
    expect(pitchAdjustPercent(0.94)).toBeCloseTo(-6, 3);
  });

  it("clamps tempo when switching to narrower range", () => {
    expect(clampTempoToRange(1.5, "16")).toBe(1.16);
  });
});
