import { ScrollingWaveform } from "./ScrollingWaveform";

type DualWaveformDeckProps = {
  peaksA: number[];
  peaksB: number[];
  positionRefA: React.RefObject<number>;
  positionRefB: React.RefObject<number>;
  durationA: number;
  durationB: number;
  playingA: boolean;
  playingB: boolean;
  bpmA?: number | null;
  bpmB?: number | null;
  beatgridOffsetA?: number;
  beatgridOffsetB?: number;
  onSeekA: (pos: number) => void;
  onSeekB: (pos: number) => void;
  className?: string;
};

export function DualWaveformDeck({
  peaksA,
  peaksB,
  positionRefA,
  positionRefB,
  durationA,
  durationB,
  playingA,
  playingB,
  bpmA,
  bpmB,
  beatgridOffsetA = 0,
  beatgridOffsetB = 0,
  onSeekA,
  onSeekB,
  className = "",
}: DualWaveformDeckProps) {
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden border-y border-zinc-800/60 bg-[#08080c] ${className}`}
      aria-label="Dual scrolling waveforms"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col divide-y divide-zinc-800/50">
        <ScrollingWaveform
          peaks={peaksA}
          bpm={bpmA}
          beatgridOffset={beatgridOffsetA}
          positionRef={positionRefA}
          duration={durationA}
          playing={playingA}
          deckColor="a"
          label="Deck A Waveform"
          onSeek={onSeekA}
        />
        <ScrollingWaveform
          peaks={peaksB}
          bpm={bpmB}
          beatgridOffset={beatgridOffsetB}
          positionRef={positionRefB}
          duration={durationB}
          playing={playingB}
          deckColor="b"
          label="Deck B Waveform"
          onSeek={onSeekB}
        />
      </div>
    </section>
  );
}
