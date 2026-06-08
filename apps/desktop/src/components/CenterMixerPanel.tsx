import type { SweepBarCount } from "../lib/crossfaderMotion";
import { MIXER_FADER_HEIGHT_PX, MIXER_VU_HEIGHT_PX } from "../lib/mixerLayout";
import { Crossfader } from "./Crossfader";
import { CompactWaveform } from "./CompactWaveform";
import { Fader } from "./Fader";
import { ChannelStrip } from "./Mixer";
import { SegmentedVUMeter } from "./SegmentedVUMeter";

export type CenterMixerPanelProps = {
  peaksA: number[];
  peaksB: number[];
  bpmA?: number | null;
  bpmB?: number | null;
  beatgridOffsetA?: number;
  beatgridOffsetB?: number;
  positionRefA: React.RefObject<number>;
  positionRefB: React.RefObject<number>;
  durationA: number;
  durationB: number;
  playingA: boolean;
  playingB: boolean;
  onSeekA: (pos: number) => void;
  onSeekB: (pos: number) => void;
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

export function CenterMixerPanel({
  peaksA,
  peaksB,
  bpmA,
  bpmB,
  beatgridOffsetA = 0,
  beatgridOffsetB = 0,
  positionRefA,
  positionRefB,
  durationA,
  durationB,
  playingA,
  playingB,
  onSeekA,
  onSeekB,
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
}: CenterMixerPanelProps) {
  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-2 border-x border-zinc-800/40 bg-[#0d0d12] px-2 py-2"
      aria-label="Center mixer"
    >
      <div className="flex shrink-0 flex-col gap-1">
        <CompactWaveform
          peaks={peaksA}
          bpm={bpmA}
          beatgridOffset={beatgridOffsetA}
          positionRef={positionRefA}
          duration={durationA}
          playing={playingA}
          deckColor="a"
          label="Deck A"
          onSeek={onSeekA}
          className="w-full"
        />
        <CompactWaveform
          peaks={peaksB}
          bpm={bpmB}
          beatgridOffset={beatgridOffsetB}
          positionRef={positionRefB}
          duration={durationB}
          playing={playingB}
          deckColor="b"
          label="Deck B"
          onSeek={onSeekB}
          className="w-full"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2">
        <div className="flex w-full items-end justify-between gap-2 px-1">
          <ChannelStrip
            label="A"
            eq={eqA}
            filter={filterA}
            trim={trimA}
            onEq={onEqA}
            onFilter={onFilterA}
            onTrim={onTrimA}
            compact
            align="left"
          />

          <div
            className="flex shrink-0 items-end justify-center gap-5"
            style={{ minHeight: MIXER_FADER_HEIGHT_PX + 20 }}
          >
            <Fader
              label="A"
              value={volumeA}
              heightPx={MIXER_FADER_HEIGHT_PX}
              variant="mixer"
              onChange={onVolumeA}
            />
            <SegmentedVUMeter
              left={outputLeft}
              right={outputRight}
              height={MIXER_VU_HEIGHT_PX}
            />
            <Fader
              label="B"
              value={volumeB}
              heightPx={MIXER_FADER_HEIGHT_PX}
              variant="mixer"
              onChange={onVolumeB}
            />
          </div>

          <ChannelStrip
            label="B"
            eq={eqB}
            filter={filterB}
            trim={trimB}
            onEq={onEqB}
            onFilter={onFilterB}
            onTrim={onTrimB}
            compact
            align="right"
          />
        </div>

        <Crossfader
          value={crossfader}
          sweepBars={crossfaderSweepBars}
          onChange={onCrossfader}
          onSweepBarsChange={onCrossfaderSweepBarsChange}
        />
      </div>
    </section>
  );
}
