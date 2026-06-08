import { describe, it, expect } from "vitest";
import { computeWaveformWindow } from "./waveformWindow";

describe("computeWaveformWindow", () => {
  it("uses at least 64 peaks in the window for long tracks", () => {
    const atCenter = computeWaveformWindow({
      peakCount: 512,
      duration: 3600,
      position: 1800,
      windowSeconds: 12,
    });
    expect(atCenter.windowPeaks).toBeGreaterThanOrEqual(64);
    expect(atCenter.visiblePeaks).toBeGreaterThanOrEqual(64);

    const atStart = computeWaveformWindow({
      peakCount: 512,
      duration: 3600,
      position: 0,
      windowSeconds: 12,
    });
    expect(atStart.windowPeaks).toBeGreaterThanOrEqual(64);
    expect(atStart.visiblePeaks).toBeGreaterThan(1);
  });

  it("returns zero visible peaks when duration is zero", () => {
    const { visiblePeaks } = computeWaveformWindow({
      peakCount: 512,
      duration: 0,
      position: 0,
    });
    expect(visiblePeaks).toBe(0);
  });
});
