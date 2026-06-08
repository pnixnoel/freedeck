import { useCallback, useRef, useState } from "react";
import {
  angleDeltaToSeekSeconds,
  positionToRotationDeg,
  wrapAngleDelta,
} from "../lib/jogWheel";

type JogWheelProps = {
  position: number;
  duration: number;
  playing: boolean;
  tempo?: number;
  trackTitle?: string;
  deckLabel: string;
  onNudge: (deltaSeconds: number) => void;
};

export function JogWheel({
  position,
  duration,
  playing,
  tempo = 1,
  trackTitle,
  deckLabel,
  onNudge,
}: JogWheelProps) {
  const initial = trackTitle?.charAt(0).toUpperCase() ?? "?";
  const dragging = useRef(false);
  const lastAngle = useRef<number | null>(null);
  const dragStartRotation = useRef(0);
  const [dragAngleOffset, setDragAngleOffset] = useState(0);

  const baseRotation = positionToRotationDeg(position, tempo);
  const rotation = dragging.current ? dragStartRotation.current + dragAngleOffset : baseRotation;

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = angleDeltaToSeekSeconds(-e.deltaY * 0.5);
      onNudge(delta);
    },
    [onNudge],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = true;
      dragStartRotation.current = positionToRotationDeg(position, tempo);
      setDragAngleOffset(0);
      lastAngle.current = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    },
    [position, tempo],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current || lastAngle.current === null) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
      const delta = wrapAngleDelta(lastAngle.current, angle);
      lastAngle.current = angle;
      setDragAngleOffset((prev) => prev + delta);
      onNudge(angleDeltaToSeekSeconds(delta));
    },
    [onNudge],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    lastAngle.current = null;
    setDragAngleOffset(0);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      className="flex w-full items-center justify-center"
      aria-label={`${deckLabel} jog wheel`}
    >
      <div
        className="relative aspect-square w-[min(320px,100cqmin)] min-w-[220px] max-w-full touch-none select-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="absolute inset-0 rounded-full border-2 border-zinc-700 bg-gradient-to-br from-zinc-800 to-zinc-950 shadow-inner" />

        <div
          className="pointer-events-none absolute inset-2 rounded-full border border-zinc-600/50 bg-[radial-gradient(circle_at_50%_40%,#2a2a32_0%,#121218_55%,#0a0a0f_100%)] shadow-lg"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div className="absolute left-1/2 top-[6%] h-5 w-1.5 -translate-x-1/2 rounded-sm bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
          <div className="absolute right-[10%] top-1/2 h-1 w-2.5 -translate-y-1/2 rounded-sm bg-zinc-500/70" />
          <div className="absolute bottom-[10%] left-1/2 h-1 w-2.5 -translate-x-1/2 rounded-sm bg-zinc-500/70" />
          <div className="absolute left-[10%] top-1/2 h-1 w-2.5 -translate-y-1/2 rounded-sm bg-zinc-500/70" />
        </div>

        <div className="pointer-events-none absolute inset-[22%] flex items-center justify-center rounded-full bg-gradient-to-br from-zinc-900 to-black shadow-lg">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-800 text-4xl font-bold text-zinc-400">
            {initial}
          </div>
        </div>

        {playing && (
          <div className="pointer-events-none absolute -right-0.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
        )}
      </div>
    </div>
  );
}
