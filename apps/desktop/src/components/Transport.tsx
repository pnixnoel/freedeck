type TransportProps = {
  side: "left" | "right";
  gridColumns: string;
  playing: boolean;
  onCue: () => void;
  onPlayToggle: () => void;
};

export function Transport({ side, gridColumns, playing, onCue, onPlayToggle }: TransportProps) {
  const cueButton = (
    <button
      type="button"
      onClick={onCue}
      className="flex h-10 w-14 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800"
      aria-label="Cue"
    >
      CUE
    </button>
  );

  const playButton = (
    <button
      type="button"
      onClick={onPlayToggle}
      className={`flex h-14 w-14 items-center justify-center rounded-full text-base font-bold text-white shadow-lg ${
        playing
          ? "bg-amber-500 hover:bg-amber-400"
          : "bg-emerald-500 hover:bg-emerald-400"
      }`}
      aria-label={playing ? "Pause" : "Play"}
    >
      {playing ? "II" : "▶"}
    </button>
  );

  return (
    <div
      className="grid shrink-0 pt-2"
      style={{ gridTemplateColumns: gridColumns, gap: 16 }}
    >
      {side === "left" ? (
        <>
          <div className="flex items-center pl-2">{cueButton}</div>
          <div className="flex items-center justify-center">{playButton}</div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-center">{playButton}</div>
          <div className="flex items-center justify-end pr-2">{cueButton}</div>
        </>
      )}
    </div>
  );
}
