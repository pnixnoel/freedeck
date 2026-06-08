import { describe, expect, it } from "vitest";
import { doubleBpm, halveBpm } from "./bpmOctave";

describe("bpmOctave", () => {
  it("doubles 61.5 to 123", () => {
    expect(doubleBpm(61.5)).toBe(123);
  });

  it("halves 123 to 61.5", () => {
    expect(halveBpm(123)).toBe(61.5);
  });

  it("rejects out of range double", () => {
    expect(doubleBpm(150)).toBeNull();
  });

  it("rejects out of range halve", () => {
    expect(halveBpm(100)).toBeNull();
  });
});
