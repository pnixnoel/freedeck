import { useCallback } from "react";
import { usePointerValue } from "../hooks/usePointerValue";
import { valueFromHorizontalPointer } from "../lib/pointerValue";

type HorizontalFaderProps = {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  variant?: "default" | "mixer";
  onChange: (value: number) => void;
};

const MIXER_TICKS = [
  { pct: 0, h: 8 },
  { pct: 16.67, h: 10 },
  { pct: 33.33, h: 10 },
  { pct: 50, h: 16 },
  { pct: 66.67, h: 10 },
  { pct: 83.33, h: 10 },
  { pct: 100, h: 8 },
];

export function HorizontalFader({
  label,
  value,
  min = -1,
  max = 1,
  variant = "default",
  onChange,
}: HorizontalFaderProps) {
  const mapPointer = useCallback(
    (clientX: number, _clientY: number, rect: DOMRect) =>
      valueFromHorizontalPointer({
        clientX,
        rect: { left: rect.left, width: rect.width },
        min,
        max,
      }),
    [min, max],
  );

  const { trackRef, onPointerDown, onPointerMove, onPointerUp } = usePointerValue(
    value,
    onChange,
    mapPointer,
  );

  const pct = ((value - min) / (max - min)) * 100;
  const isMixer = variant === "mixer";

  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      {label && (
        <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
      )}
      <div
        ref={trackRef}
        className={`relative w-full touch-none select-none ${
          isMixer ? "h-10 max-w-lg px-2" : "h-8 max-w-md px-4"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="slider"
        aria-label={label ?? "Fader"}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className="absolute left-2 right-2 top-1/2 h-px -translate-y-1/2 bg-zinc-800" />

        {isMixer &&
          MIXER_TICKS.map((tick) => (
            <div
              key={tick.pct}
              className="pointer-events-none absolute top-1/2 w-px -translate-x-1/2 -translate-y-1/2 bg-zinc-600/70"
              style={{ left: `${tick.pct}%`, height: tick.h }}
            />
          ))}

        {isMixer ? (
          <div
            className="pointer-events-none absolute top-1/2 h-7 w-12 -translate-x-1/2 -translate-y-1/2 rounded-md bg-gradient-to-b from-zinc-500 to-zinc-700 shadow-md ring-1 ring-zinc-600/80"
            style={{ left: `${pct}%` }}
          >
            <div className="absolute bottom-1 left-1/2 top-1 w-0.5 -translate-x-1/2 bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]" />
          </div>
        ) : (
          <div
            className="pointer-events-none absolute top-1/2 h-6 w-10 -translate-x-1/2 -translate-y-1/2 rounded border border-zinc-600 bg-zinc-700 shadow"
            style={{ left: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
