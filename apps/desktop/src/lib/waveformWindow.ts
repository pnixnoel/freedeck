export function computeWaveformWindow(opts: {
  peakCount: number;
  duration: number;
  position: number;
  windowSeconds?: number;
  minVisiblePeaks?: number;
}) {
  const windowSeconds = opts.windowSeconds ?? 12;
  const minVisiblePeaks = opts.minVisiblePeaks ?? 64;

  if (opts.peakCount <= 0 || opts.duration <= 0) {
    return { startPeak: 0, endPeak: 0, visiblePeaks: 0, windowPeaks: minVisiblePeaks };
  }

  const peaksPerSecond = opts.peakCount / opts.duration;
  const windowPeaks = Math.max(minVisiblePeaks, Math.floor(windowSeconds * peaksPerSecond));
  const centerPeak = (opts.position / opts.duration) * opts.peakCount;
  const startPeak = Math.max(0, Math.floor(centerPeak - windowPeaks / 2));
  const endPeak = Math.min(opts.peakCount, Math.ceil(centerPeak + windowPeaks / 2));

  return {
    startPeak,
    endPeak,
    visiblePeaks: endPeak - startPeak,
    windowPeaks,
  };
}
