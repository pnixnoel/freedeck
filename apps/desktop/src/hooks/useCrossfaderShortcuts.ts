import { useEffect, useRef } from "react";
import {
  CROSSFADER_POSITIONS,
  clampCrossfader,
  lerpCrossfader,
  matchCrossfaderShortcut,
  resolveSweepBpm,
  resolveSweepFromCurrent,
  sweepDurationMs,
  type CrossfaderShortcutAction,
  type ResolveCrossfaderBpmInput,
  type SweepBarCount,
} from "../lib/crossfaderMotion";

export type UseCrossfaderShortcutsOptions = {
  sweepBars: SweepBarCount;
  bpmInput: ResolveCrossfaderBpmInput;
  crossfaderPosition: number;
  onCrossfader: (value: number) => void;
};

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
  crossfaderPosition,
  onCrossfader,
}: UseCrossfaderShortcutsOptions): void {
  const onCrossfaderRef = useRef(onCrossfader);
  const sweepBarsRef = useRef(sweepBars);
  const bpmInputRef = useRef(bpmInput);
  const positionRef = useRef(crossfaderPosition);
  const rafRef = useRef<number | null>(null);

  onCrossfaderRef.current = onCrossfader;
  sweepBarsRef.current = sweepBars;
  bpmInputRef.current = bpmInput;
  positionRef.current = crossfaderPosition;

  const setCrossfader = (value: number) => {
    const clamped = clampCrossfader(value);
    positionRef.current = clamped;
    onCrossfaderRef.current(clamped);
  };

  const cancelSweep = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const startSweep = (action: "sweep-left" | "sweep-right") => {
    cancelSweep();
    const { from, to, travelFraction } = resolveSweepFromCurrent(
      positionRef.current,
      action,
    );
    if (travelFraction === 0) return;

    const bpm = resolveSweepBpm(action, bpmInputRef.current);
    const durationMs = sweepDurationMs(sweepBarsRef.current, bpm, travelFraction);
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const value = clampCrossfader(lerpCrossfader(from, to, t));
      setCrossfader(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = matchCrossfaderShortcut(event);
      if (!action) return;

      event.preventDefault();

      if (event.repeat && (action === "sweep-left" || action === "sweep-right")) {
        return;
      }

      cancelSweep();

      if (action === "sweep-left" || action === "sweep-right") {
        startSweep(action);
        return;
      }

      setCrossfader(snapValue(action));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelSweep();
    };
  }, []);
}
