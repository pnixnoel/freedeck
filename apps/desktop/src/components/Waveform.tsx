import { useCallback, useEffect, useRef } from "react";

type WaveformProps = {
  peaks: number[];
  position: number;
  duration: number;
  onSeek: (position: number) => void;
};

export function Waveform({ peaks, position, duration, onSeek }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#18181f";
    ctx.fillRect(0, 0, width, height);

    if (peaks.length === 0) {
      ctx.fillStyle = "#52525b";
      ctx.font = "12px system-ui";
      ctx.fillText("Load a track", 12, height / 2);
      return;
    }

    const mid = height / 2;
    const barWidth = width / peaks.length;

    ctx.fillStyle = "#3b82f6";
    for (let i = 0; i < peaks.length; i++) {
      const amp = peaks[i] * (height * 0.45);
      const x = i * barWidth;
      ctx.fillRect(x, mid - amp, Math.max(1, barWidth - 0.5), amp * 2);
    }

    if (duration > 0) {
      const playheadX = (position / duration) * width;
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
  }, [peaks, position, duration]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    onSeek(ratio * duration);
  };

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={96}
      onClick={handleClick}
      className="h-24 w-full cursor-pointer rounded-md border border-zinc-800 bg-zinc-900"
    />
  );
}
