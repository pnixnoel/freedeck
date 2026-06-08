import { describe, it, expect } from "vitest";
import {
  angleDeltaToSeekSeconds,
  DEGREES_PER_TRACK_SECOND,
  positionToRotationDeg,
  SECONDS_PER_VINYL_ROTATION,
  VINYL_RPM,
  wrapAngleDelta,
} from "./jogWheel";

describe("vinyl constants", () => {
  it("uses 33⅓ RPM industry standard", () => {
    expect(VINYL_RPM).toBeCloseTo(33.333, 2);
    expect(SECONDS_PER_VINYL_ROTATION).toBeCloseTo(1.8, 2);
    expect(DEGREES_PER_TRACK_SECOND).toBeCloseTo(200, 1);
  });
});

describe("positionToRotationDeg", () => {
  it("completes one rotation every 1.8s of playback at tempo 1", () => {
    expect(positionToRotationDeg(1.8, 1)).toBeCloseTo(360);
    expect(positionToRotationDeg(3.6, 1)).toBeCloseTo(720);
  });

  it("scales with tempo", () => {
    expect(positionToRotationDeg(1.8, 1.2)).toBeCloseTo(432);
  });
});

describe("angleDeltaToSeekSeconds", () => {
  it("maps one full drag rotation to 1.8s of track time", () => {
    expect(angleDeltaToSeekSeconds(360)).toBeCloseTo(SECONDS_PER_VINYL_ROTATION);
  });
});

describe("wrapAngleDelta", () => {
  it("wraps across the ±180 boundary", () => {
    expect(wrapAngleDelta(170, -170)).toBeCloseTo(20);
  });
});
