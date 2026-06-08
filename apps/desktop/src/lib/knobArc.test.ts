import { describe, it, expect } from "vitest";
import { describeArc, valueToNeedleDeg, CENTER_NEEDLE_DEG } from "./knobArc";

describe("valueToNeedleDeg", () => {
  it("needle at center is 12 o'clock (-90°)", () => {
    expect(valueToNeedleDeg(0.5)).toBeCloseTo(CENTER_NEEDLE_DEG);
  });
});

describe("describeArc", () => {
  it("fill arc goes clockwise when above center", () => {
    const arc = describeArc(0.5, 0.75);
    expect(arc.sweepFlag).toBe(1);
  });

  it("fill arc goes counter-clockwise when below center", () => {
    const arc = describeArc(0.5, 0.25);
    expect(arc.sweepFlag).toBe(0);
  });
});
