import { useCallback, useRef } from "react";
import { angleFromPointer } from "../lib/pointerValue";
import {
  angleDelta,
  applyAngleDelta,
  normToValue,
  valueToNorm,
} from "../lib/knobDrag";
import { arcPath, describeArc, fullTrackPath } from "../lib/knobArc";
import { knobCenter, snapToCenter } from "../lib/knobSnap";

type RotaryKnobProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  size?: "sm" | "md" | "compact";
  title?: string;
  onChange: (value: number) => void;
};

const SVG_SIZE = 40;
const ARC_RADIUS = 16;
const ARC_CX = SVG_SIZE / 2;
const ARC_CY = SVG_SIZE / 2;

export function RotaryKnob({
  label,
  value,
  min = -24,
  max = 24,
  step = 0.5,
  unit = "dB",
  size = "sm",
  title,
  onChange,
}: RotaryKnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragStart = useRef<{ angle: number; norm: number } | null>(null);
  const lastValue = useRef(value);
  lastValue.current = value;

  const dim =
    size === "compact" ? "h-8 w-8" : size === "sm" ? "h-10 w-10" : "h-14 w-14";
  const needle =
    size === "compact" ? "h-3" : size === "sm" ? "h-4" : "h-5";
  const labelClass =
    size === "compact"
      ? "text-[7px] font-medium uppercase tracking-wide text-zinc-500"
      : "text-[8px] font-medium uppercase tracking-wide text-zinc-500";

  const norm = valueToNorm(value, min, max);
  const centerNorm = valueToNorm(knobCenter(min, max), min, max);
  const pct = norm * 100;
  const needleRotation = (pct / 100) * 270 - 135;

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = knobRef.current;
      const start = dragStart.current;
      if (!el || !start) return;

      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = angleFromPointer(cx, cy, clientX, clientY);
      const delta = angleDelta(start.angle, angle);
      let nextNorm = applyAngleDelta({
        startNorm: start.norm,
        deltaDeg: delta,
        min,
        max,
      });
      let next = normToValue(nextNorm, min, max);
      if (step > 0) {
        next = Math.round(next / step) * step;
      }
      lastValue.current = next;
      onChange(next);
    },
    [min, max, step, onChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = knobRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = true;
      dragStart.current = {
        angle: angleFromPointer(cx, cy, e.clientX, e.clientY),
        norm: valueToNorm(value, min, max),
      };
    },
    [value, min, max],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = false;
      dragStart.current = null;
      onChange(snapToCenter(lastValue.current, min, max));
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [min, max, onChange],
  );

  const arc = describeArc(centerNorm, norm);
  const activeArcPath =
    Math.abs(norm - centerNorm) > 0.001
      ? arcPath(
          ARC_CX,
          ARC_CY,
          ARC_RADIUS,
          arc.startDeg,
          arc.endDeg,
          arc.sweepFlag as 0 | 1,
        )
      : null;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={labelClass}>{label}</span>
      <div
        ref={knobRef}
        className={`relative shrink-0 touch-none select-none ${dim}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        title={title}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        >
          <path
            d={fullTrackPath(ARC_CX, ARC_CY, ARC_RADIUS)}
            fill="none"
            stroke="#3f3f46"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {activeArcPath && (
            <path
              d={activeArcPath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}
        </svg>
        <div className="absolute inset-[18%] rounded-full bg-zinc-900 shadow-inner" />
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 ${needle} w-0.5 origin-bottom -translate-x-1/2 rounded-full bg-white`}
          style={{
            transform: `translate(-50%, -100%) rotate(${needleRotation}deg)`,
          }}
        />
      </div>
      {size !== "compact" && (
        <span className="text-[8px] text-zinc-500">
          {value.toFixed(unit === "dB" ? 1 : 0)}
          {unit}
        </span>
      )}
    </div>
  );
}
