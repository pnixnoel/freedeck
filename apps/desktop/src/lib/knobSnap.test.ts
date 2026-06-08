import { describe, it, expect } from "vitest";
import { snapToCenter } from "./knobSnap";

describe("snapToCenter", () => {
  it("snaps filter knob near 50% to exactly 50", () => {
    expect(snapToCenter(48, 0, 100)).toBe(50);
    expect(snapToCenter(52, 0, 100)).toBe(50);
  });

  it("does not snap when far from center", () => {
    expect(snapToCenter(30, 0, 100)).toBe(30);
  });

  it("snaps EQ near 0 dB", () => {
    expect(snapToCenter(0.4, -24, 24)).toBe(0);
  });
});
