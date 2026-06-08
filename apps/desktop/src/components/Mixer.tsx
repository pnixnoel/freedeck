import type { SweepBarCount } from "../lib/crossfaderMotion";
import { Crossfader } from "./Crossfader";
import { Fader } from "./Fader";
import { Knob } from "./Knob";
import { VUMeter } from "./VUMeter";

export type MixerProps = {
  crossfader: number;
  crossfaderSweepBars: SweepBarCount;
  eqA: [number, number, number];
  eqB: [number, number, number];
  filterA: number;
  filterB: number;
  trimA: number;
  trimB: number;
  volumeA: number;
  volumeB: number;
  outputLeft: number;
  outputRight: number;
  onCrossfader: (value: number) => void;
  onCrossfaderSweepBarsChange: (bars: SweepBarCount) => void;
  onEqA: (band: 0 | 1 | 2, value: number) => void;
  onEqB: (band: 0 | 1 | 2, value: number) => void;
  onFilterA: (value: number) => void;
  onFilterB: (value: number) => void;
  onTrimA: (value: number) => void;
  onTrimB: (value: number) => void;
  onVolumeA: (value: number) => void;
  onVolumeB: (value: number) => void;
};

const EQ_LABELS = ["High", "Mid", "Low"] as const;

export function Mixer(props: MixerProps) {
  const {
    crossfader,
    crossfaderSweepBars,
    eqA,
    eqB,
    filterA,
    filterB,
    trimA,
    trimB,
    volumeA,
    volumeB,
    outputLeft,
    outputRight,
    onCrossfader,
    onCrossfaderSweepBarsChange,
    onEqA,
    onEqB,
    onFilterA,
    onFilterB,
    onTrimA,
    onTrimB,
    onVolumeA,
    onVolumeB,
  } = props;

  return (
    <section
      className="flex shrink-0 flex-col gap-2 border-x border-zinc-800/40 bg-[#0d0d12] px-3 py-2"
      aria-label="Mixer"
    >
      <h2 className="text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Mixer
      </h2>

      <div className="flex items-end justify-center gap-6">
        <ChannelStrip
          label="Deck A"
          eq={eqA}
          filter={filterA}
          trim={trimA}
          onEq={onEqA}
          onFilter={onFilterA}
          onTrim={onTrimA}
        />
        <Fader label="Ch A" value={volumeA} onChange={onVolumeA} />
        <div className="flex gap-2">
          <VUMeter label="L" level={outputLeft} height={56} />
          <VUMeter label="R" level={outputRight} height={56} />
        </div>
        <Fader label="Ch B" value={volumeB} onChange={onVolumeB} />
        <ChannelStrip
          label="Deck B"
          eq={eqB}
          filter={filterB}
          trim={trimB}
          onEq={onEqB}
          onFilter={onFilterB}
          onTrim={onTrimB}
        />
      </div>

      <Crossfader
        value={crossfader}
        sweepBars={crossfaderSweepBars}
        onChange={onCrossfader}
        onSweepBarsChange={onCrossfaderSweepBarsChange}
      />
    </section>
  );
}

export function ChannelStrip({
  label,
  eq,
  filter,
  trim,
  onEq,
  onFilter,
  onTrim,
  compact = false,
  align = "center",
}: {
  label: string;
  eq: [number, number, number];
  filter: number;
  trim: number;
  onEq: (band: 0 | 1 | 2, value: number) => void;
  onFilter: (value: number) => void;
  onTrim: (value: number) => void;
  compact?: boolean;
  align?: "left" | "right" | "center";
}) {
  const alignClass =
    align === "left"
      ? "items-start self-end"
      : align === "right"
        ? "items-end self-end"
        : "items-center";

  if (compact) {
    return (
      <div className={`flex shrink-0 flex-col gap-0.5 ${alignClass}`}>
        <span className="text-[8px] font-medium uppercase text-zinc-600">{label}</span>
        <Knob
          label="Filter"
          value={filter}
          min={0}
          max={100}
          unit="%"
          onChange={onFilter}
          title="Filter: left = low-pass, right = high-pass, center = bypass"
        />
        <div className="flex flex-col gap-0.5">
          {EQ_LABELS.map((eqLabel, i) => (
            <Knob
              key={`${label}-${eqLabel}`}
              label={eqLabel}
              value={eq[i]}
              onChange={(v) => onEq(i as 0 | 1 | 2, v)}
            />
          ))}
        </div>
        <Knob
          label="Trim"
          value={trim}
          min={-12}
          max={12}
          onChange={onTrim}
          title="Input trim gain"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] font-medium uppercase text-zinc-600">{label}</span>
      <div className="flex gap-1">
        {EQ_LABELS.map((eqLabel, i) => (
          <Knob
            key={`${label}-${eqLabel}`}
            label={eqLabel}
            value={eq[i]}
            onChange={(v) => onEq(i as 0 | 1 | 2, v)}
          />
        ))}
        <Knob
          label="Filter"
          value={filter}
          min={0}
          max={100}
          unit="%"
          onChange={onFilter}
          title="Filter: left = low-pass, right = high-pass, center = bypass"
        />
        <Knob
          label="Trim"
          value={trim}
          min={-12}
          max={12}
          onChange={onTrim}
          title="Input trim gain"
        />
      </div>
    </div>
  );
}
