import { describe, it, expect } from "vitest";
import { applyAngleDelta, angleDelta, valueToNorm, normToValue } from "./knobDrag";

describe("angleDelta", () => {
  it("wraps across ±180 boundary", () => {
    expect(angleDelta(170, -170)).toBeCloseTo(20);
    expect(angleDelta(-170, 170)).toBeCloseTo(-20);
  });
});

describe("applyAngleDelta", () => {
  it("decreases filter value when dragging counter-clockwise from 17%", () => {
    const min = 0;
    const max = 100;
    const startNorm = valueToNorm(17, min, max);
    const next = applyAngleDelta({ startNorm, deltaDeg: -30, min, max });
    expect(normToValue(next, min, max)).toBeLessThan(17);
  });

  it("never wraps to max when dragging below 18%", () => {
    const min = 0;
    const max = 100;
    let norm = valueToNorm(18, min, max);
    for (let i = 0; i < 5; i++) {
      norm = applyAngleDelta({ startNorm: norm, deltaDeg: -20, min, max });
    }
    expect(normToValue(norm, min, max)).toBeLessThan(18);
  });
});
