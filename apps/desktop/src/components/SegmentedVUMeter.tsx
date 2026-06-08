import {
  levelToLitSegments,
  SEGMENT_COUNT,
  segmentColor,
} from "../lib/vuSegments";
import { MIXER_VU_HEIGHT_PX, MIXER_VU_SEGMENT_WIDTH_PX } from "../lib/mixerLayout";

type SegmentedVUMeterProps = {
  left: number;
  right: number;
  height?: number;
};

const COLOR_CLASS = {
  green: "bg-emerald-500",
  lime: "bg-lime-400",
  off: "bg-[#1a1a1f]",
} as const;

function MeterColumn({ label, level, height }: { label: string; level: number; height: number }) {
  const lit = levelToLitSegments(level);
  const segmentHeight = (height - (SEGMENT_COUNT - 1) * 2) / SEGMENT_COUNT;

  return (
    <div className="flex flex-col items-center gap-1" aria-label={`${label} VU meter`}>
      <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <div
        className="flex flex-col-reverse gap-[2px]"
        style={{ height }}
      >
        {Array.from({ length: SEGMENT_COUNT }, (_, i) => {
          const color = segmentColor(i, lit);
          return (
            <div
              key={i}
              className={`rounded-[1px] ${COLOR_CLASS[color]}`}
              style={{ height: segmentHeight, width: MIXER_VU_SEGMENT_WIDTH_PX }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function SegmentedVUMeter({ left, right, height = MIXER_VU_HEIGHT_PX }: SegmentedVUMeterProps) {
  return (
    <div className="flex shrink-0 gap-3" aria-label="Stereo VU meters">
      <MeterColumn label="L" level={left} height={height} />
      <MeterColumn label="R" level={right} height={height} />
    </div>
  );
}
