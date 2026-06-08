import { ScrollingWaveform } from "./ScrollingWaveform";

type CompactWaveformProps = {
  peaks: number[];
  bpm?: number | null;
  beatgridOffset?: number;
  positionRef: React.RefObject<number>;
  duration: number;
  playing: boolean;
  deckColor: "a" | "b";
  label: string;
  onSeek: (position: number) => void;
  className?: string;
};

export function CompactWaveform({
  className = "",
  deckColor,
  ...props
}: CompactWaveformProps) {
  return (
    <div className={`relative h-[72px] min-w-0 overflow-hidden rounded border border-zinc-800/60 bg-[#0a0a0f] ${className}`}>
      <ScrollingWaveform
        {...props}
        deckColor={deckColor}
        windowSeconds={8}
      />
    </div>
  );
}
