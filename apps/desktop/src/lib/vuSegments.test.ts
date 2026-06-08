import { describe, it, expect } from "vitest";
import { levelToLitSegments, SEGMENT_COUNT, segmentColor } from "./vuSegments";

describe("levelToLitSegments", () => {
  it("lights proportional segments for level 0–1", () => {
    expect(levelToLitSegments(0)).toBe(0);
    expect(levelToLitSegments(1)).toBe(SEGMENT_COUNT);
    expect(levelToLitSegments(0.5)).toBe(Math.floor(SEGMENT_COUNT * 0.5));
  });

  it("clamps out-of-range levels", () => {
    expect(levelToLitSegments(-1)).toBe(0);
    expect(levelToLitSegments(2)).toBe(SEGMENT_COUNT);
  });
});

describe("segmentColor", () => {
  it("returns off for unlit segments", () => {
    expect(segmentColor(10, 5)).toBe("off");
  });

  it("returns lime for upper lit zone", () => {
    expect(segmentColor(SEGMENT_COUNT - 1, SEGMENT_COUNT)).toBe("lime");
  });

  it("returns green for lower lit zone", () => {
    expect(segmentColor(5, 10)).toBe("green");
  });
});
