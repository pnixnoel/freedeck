import { useEffect, useRef } from "react";
import { computeWaveformWindow } from "../lib/waveformWindow";

type ScrollingWaveformProps = {
  peaks: number[];
  bpm?: number | null;
  beatgridOffset?: number;
  positionRef: React.RefObject<number>;
  duration: number;
  playing: boolean;
  deckColor: string;
  label: string;
  onSeek: (position: number) => void;
  windowSeconds?: number;
};

function amplitudeColor(amp: number, baseHue: number): string {
  const intensity = Math.min(1, amp * 2.5);
  const sat = 70 + intensity * 30;
  const light = 35 + intensity * 35;
  return `hsl(${baseHue}, ${sat}%, ${light}%)`;
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#121218";
  ctx.fillRect(0, 0, w, h);

  const mid = h / 2;
  for (let i = 0; i < w; i += 4) {
    const amp = (Math.sin(i * 0.08) * 0.3 + Math.sin(i * 0.02) * 0.2) * (h * 0.35);
    ctx.fillStyle = `rgba(63, 63, 70, ${0.3 + Math.abs(amp) / h})`;
    ctx.fillRect(i, mid - Math.abs(amp), 3, Math.abs(amp) * 2);
  }

  ctx.fillStyle = "#71717a";
  ctx.font = "11px system-ui";
  ctx.fillText("Load a track to see waveform", 12, h / 2 + 4);
}

export function ScrollingWaveform({
  peaks,
  bpm: bpmProp,
  beatgridOffset = 0,
  positionRef,
  duration,
  playing,
  deckColor,
  label,
  onSeek,
  windowSeconds = 12,
}: ScrollingWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const hue = deckColor === "a" ? 0 : 210;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;

      if (w === 0 || h === 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, w, h);

      const position = positionRef.current ?? 0;
      const centerX = w / 2;

      if (peaks.length > 0 && duration > 0) {
        const { startPeak, endPeak, visiblePeaks, windowPeaks } = computeWaveformWindow({
          peakCount: peaks.length,
          duration,
          position,
          windowSeconds,
        });
        const centerPeak = (position / duration) * peaks.length;

        if (visiblePeaks > 0) {
          const barW = w / visiblePeaks;
          const mid = h / 2;

          for (let i = startPeak; i < endPeak; i++) {
            const amp = Math.min(h * 0.44, peaks[i] * h * 0.44);
            const x = (i - startPeak) * barW;
            const relPos = (i - centerPeak) / (windowPeaks / 2);
            const distFromCenter = Math.abs(relPos);
            const alpha = Math.max(0.35, 1 - distFromCenter * 0.4);

            ctx.globalAlpha = alpha;
            ctx.fillStyle = amplitudeColor(peaks[i], hue);
            ctx.fillRect(x, mid - amp, Math.max(1, barW - 0.3), amp * 2);
          }
          ctx.globalAlpha = 1;
        }

        const bpm = bpmProp != null && bpmProp > 0 ? bpmProp : null;
        if (bpm) {
          const beatInterval = 60 / bpm;
          const windowStart = Math.max(0, position - windowSeconds / 2);
          const gridStart = beatgridOffset;
          let t = gridStart;
          if (t < windowStart) {
            const beatsToSkip = Math.floor((windowStart - gridStart) / beatInterval);
            t = gridStart + beatsToSkip * beatInterval;
            if (t < windowStart) t += beatInterval;
          }
          for (; t < position + windowSeconds / 2; t += beatInterval) {
            const relT = t - position;
            const x = centerX + (relT / windowSeconds) * w;
            if (x >= 0 && x <= w) {
              ctx.strokeStyle = "rgba(255,255,255,0.08)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, h);
              ctx.stroke();
            }
          }
        }
      } else {
        drawPlaceholder(ctx, w, h);
      }

      ctx.strokeStyle = playing ? "#ffffff" : "#a1a1aa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, h);
      ctx.stroke();

      ctx.fillStyle = playing ? "#ffffff" : "#a1a1aa";
      ctx.beginPath();
      ctx.moveTo(centerX - 5, 0);
      ctx.lineTo(centerX + 5, 0);
      ctx.lineTo(centerX, 7);
      ctx.closePath();
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [peaks, duration, playing, positionRef, windowSeconds, hue, bpmProp, beatgridOffset]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (duration <= 0 || peaks.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const centerX = rect.width / 2;
    const position = positionRef.current ?? 0;
    const relOffset = ((x - centerX) / rect.width) * windowSeconds;
    const newPos = Math.max(0, Math.min(duration, position + relOffset));
    onSeek(newPos);
  };

  return (
    <div ref={containerRef} className="relative h-full min-h-0 overflow-hidden">
      <span className="absolute left-2 top-1 z-10 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="absolute inset-0 cursor-pointer"
        aria-label={`${label} scrolling waveform`}
      />
    </div>
  );
}
