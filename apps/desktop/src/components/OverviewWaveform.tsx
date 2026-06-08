import { useCallback, useEffect, useRef } from "react";

type OverviewWaveformProps = {
  peaks: number[];
  position: number;
  duration: number;
  color: string;
  onSeek: (position: number) => void;
};

export function OverviewWaveform({
  peaks,
  position,
  duration,
  color,
  onSeek,
}: OverviewWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    if (w === 0 || h === 0) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#121218";
    ctx.fillRect(0, 0, w, h);

    if (peaks.length === 0) return;

    const mid = h / 2;
    const barW = w / peaks.length;

    for (let i = 0; i < peaks.length; i++) {
      const amp = Math.min(h * 0.42, peaks[i] * h * 0.42);
      const x = i * barW;
      const played = duration > 0 && i / peaks.length <= position / duration;
      ctx.fillStyle = played ? color : "#3f3f46";
      ctx.fillRect(x, mid - amp, Math.max(1, barW - 0.5), amp * 2);
    }

    if (duration > 0) {
      const playheadX = (position / duration) * w;
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
    }
  }, [peaks, position, duration, color]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onSeek((x / rect.width) * duration);
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="h-6 w-full cursor-pointer rounded-sm bg-zinc-900"
      aria-label="Track overview waveform"
    />
  );
}
