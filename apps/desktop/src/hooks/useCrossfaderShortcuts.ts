import { useEffect, useRef } from "react";
import {
  CROSSFADER_POSITIONS,
  barsToDurationMs,
  clampCrossfader,
  lerpCrossfader,
  matchCrossfaderShortcut,
  resolveSweepBpm,
  type CrossfaderShortcutAction,
  type ResolveCrossfaderBpmInput,
  type SweepBarCount,
} from "../lib/crossfaderMotion";

export type UseCrossfaderShortcutsOptions = {
  sweepBars: SweepBarCount;
  bpmInput: ResolveCrossfaderBpmInput;
  onCrossfader: (value: number) => void;
};

function sweepEndpoints(action: "sweep-left" | "sweep-right"): { from: number; to: number } {
  if (action === "sweep-left") {
    return { from: CROSSFADER_POSITIONS.right, to: CROSSFADER_POSITIONS.left };
  }
  return { from: CROSSFADER_POSITIONS.left, to: CROSSFADER_POSITIONS.right };
}

function snapValue(action: Extract<CrossfaderShortcutAction, `snap-${string}`>): number {
  switch (action) {
    case "snap-center":
      return CROSSFADER_POSITIONS.center;
    case "snap-left":
      return CROSSFADER_POSITIONS.left;
    case "snap-right":
      return CROSSFADER_POSITIONS.right;
  }
}

export function useCrossfaderShortcuts({
  sweepBars,
  bpmInput,
  onCrossfader,
}: UseCrossfaderShortcutsOptions): void {
  const onCrossfaderRef = useRef(onCrossfader);
  const sweepBarsRef = useRef(sweepBars);
  const bpmInputRef = useRef(bpmInput);
  const rafRef = useRef<number | null>(null);

  onCrossfaderRef.current = onCrossfader;
  sweepBarsRef.current = sweepBars;
  bpmInputRef.current = bpmInput;

  const cancelSweep = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const startSweep = (action: "sweep-left" | "sweep-right") => {
    cancelSweep();
    const { from, to } = sweepEndpoints(action);
    const bpm = resolveSweepBpm(action, bpmInputRef.current);
    const durationMs = barsToDurationMs(sweepBarsRef.current, bpm);
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const value = clampCrossfader(lerpCrossfader(from, to, t));
      onCrossfaderRef.current(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    onCrossfaderRef.current(from);
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = matchCrossfaderShortcut(event);
      if (!action) return;

      event.preventDefault();
      cancelSweep();

      if (action === "sweep-left" || action === "sweep-right") {
        startSweep(action);
        return;
      }

      onCrossfaderRef.current(snapValue(action));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelSweep();
    };
  }, []);
}
