import { describe, it, expect } from "vitest";
import {
  valueFromVerticalPointer,
  valueFromHorizontalPointer,
  valueFromAngle,
} from "./pointerValue";

describe("valueFromVerticalPointer", () => {
  it("maps bottom of track to min and top to max", () => {
    expect(
      valueFromVerticalPointer({ clientY: 100, rect: { top: 0, height: 100 }, min: 0, max: 1 }),
    ).toBeCloseTo(0);
    expect(
      valueFromVerticalPointer({ clientY: 0, rect: { top: 0, height: 100 }, min: 0, max: 1 }),
    ).toBeCloseTo(1);
  });
});

describe("valueFromHorizontalPointer", () => {
  it("maps left to min and right to max", () => {
    expect(
      valueFromHorizontalPointer({ clientX: 0, rect: { left: 0, width: 200 }, min: -1, max: 1 }),
    ).toBeCloseTo(-1);
    expect(
      valueFromHorizontalPointer({
        clientX: 200,
        rect: { left: 0, width: 200 },
        min: -1,
        max: 1,
      }),
    ).toBeCloseTo(1);
  });
});

describe("valueFromAngle", () => {
  it("maps 12 o'clock to center of range", () => {
    expect(valueFromAngle({ angleDeg: -90, min: -12, max: 12 })).toBeCloseTo(0, 0);
  });
});
