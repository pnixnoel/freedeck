import { useCallback, useMemo } from "react";
import { usePointerValue } from "../hooks/usePointerValue";
import {
  MIXER_FADER_CAP_WIDTH_PX,
  MIXER_FADER_HEIGHT_PX,
  MIXER_FADER_WIDTH_PX,
} from "../lib/mixerLayout";
import { valueFromVerticalPointer } from "../lib/pointerValue";

type VerticalFaderProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  height?: string;
  heightPx?: number;
  variant?: "default" | "mixer";
  onChange: (value: number) => void;
};

const MIXER_TICK_COUNT = 7;

export function VerticalFader({
  label,
  value,
  min = 0,
  max = 1,
  height = "h-24",
  heightPx,
  variant = "default",
  onChange,
}: VerticalFaderProps) {
  const mapPointer = useCallback(
    (_clientX: number, clientY: number, rect: DOMRect) =>
      valueFromVerticalPointer({ clientY, rect: { top: rect.top, height: rect.height }, min, max }),
    [min, max],
  );

  const { trackRef, onPointerDown, onPointerMove, onPointerUp } = usePointerValue(
    value,
    onChange,
    mapPointer,
  );

  const pct = ((value - min) / (max - min)) * 100;
  const isMixer = variant === "mixer";
  const trackHeightPx = isMixer ? (heightPx ?? MIXER_FADER_HEIGHT_PX) : undefined;
  const trackWidthPx = isMixer ? MIXER_FADER_WIDTH_PX : undefined;

  const ticks = useMemo(
    () => Array.from({ length: MIXER_TICK_COUNT }, (_, i) => (i / (MIXER_TICK_COUNT - 1)) * 100),
    [],
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <div
        ref={trackRef}
        className={`relative flex touch-none select-none items-center justify-center ${isMixer ? "" : `${height} w-8`}`}
        style={
          isMixer
            ? { height: trackHeightPx, width: trackWidthPx }
            : undefined
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={isMixer ? () => onChange(max) : undefined}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className={`h-full ${isMixer ? "w-px bg-zinc-800" : "w-1.5 rounded-full bg-zinc-800"}`} />

        {isMixer &&
          ticks.map((tickPct) => (
            <div
              key={tickPct}
              className="pointer-events-none absolute left-1/2 h-px w-8 -translate-x-1/2 bg-zinc-600/80"
              style={{ bottom: `${tickPct}%` }}
            />
          ))}

        {isMixer ? (
          <div
            className="pointer-events-none absolute left-1/2 h-4 -translate-x-1/2 rounded-sm bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-[0_2px_4px_rgba(0,0,0,0.5)] ring-1 ring-zinc-500/80"
            style={{
              bottom: `calc(${pct}% - 8px)`,
              width: MIXER_FADER_CAP_WIDTH_PX,
            }}
          />
        ) : (
          <div
            className="pointer-events-none absolute left-1/2 h-3 w-6 -translate-x-1/2 rounded bg-sky-400 shadow"
            style={{ bottom: `calc(${pct}% - 6px)` }}
          />
        )}
      </div>
      {isMixer && (
        <span className="text-[8px] tabular-nums text-zinc-500">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
