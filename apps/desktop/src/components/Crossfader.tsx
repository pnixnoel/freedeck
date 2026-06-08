import { SWEEP_BAR_OPTIONS, type SweepBarCount } from "../lib/crossfaderMotion";
import { HorizontalFader } from "./HorizontalFader";

type CrossfaderProps = {
  value: number;
  sweepBars: SweepBarCount;
  onChange: (value: number) => void;
  onSweepBarsChange: (bars: SweepBarCount) => void;
};

export function Crossfader({ value, sweepBars, onChange, onSweepBarsChange }: CrossfaderProps) {
  return (
    <div className="w-full rounded border border-zinc-800/80 bg-[#0a0a0f] px-3 py-3">
      <HorizontalFader
        label="Crossfader"
        value={value}
        min={-1}
        max={1}
        variant="mixer"
        onChange={onChange}
      />
      <div className="mx-auto mt-1 flex w-full max-w-lg items-center justify-between px-2">
        <span className="text-[9px] font-medium text-zinc-600">A</span>
        <label className="flex items-center gap-1 text-[9px] text-zinc-500">
          <span>Sweep bars</span>
          <select
            value={sweepBars}
            onChange={(e) => onSweepBarsChange(Number(e.target.value) as SweepBarCount)}
            className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9px] text-zinc-300"
            aria-label="Crossfader sweep duration in bars"
          >
            {SWEEP_BAR_OPTIONS.map((bars) => (
              <option key={bars} value={bars}>
                {bars}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[9px] font-medium text-zinc-600">B</span>
      </div>
    </div>
  );
}
