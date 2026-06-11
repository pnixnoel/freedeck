type TransportProps = {
  side: "left" | "right";
  gridColumns: string;
  playing: boolean;
  onCue: () => void;
  onPlayToggle: () => void;
  quantizeEnabled?: boolean;
  onQuantizeToggle?: () => void;
};

export function Transport({
  side,
  gridColumns,
  playing,
  onCue,
  onPlayToggle,
  quantizeEnabled = false,
  onQuantizeToggle,
}: TransportProps) {
  const quantizeButton = (
    <button
      type="button"
      onClick={onQuantizeToggle}
      className={`flex h-8 w-8 items-center justify-center rounded border text-[9px] font-bold transition-all duration-150 ${
        quantizeEnabled
          ? "border-rose-500 bg-rose-500/10 text-rose-200 shadow-[0_0_8px_rgba(244,63,94,0.45)] ring-1 ring-rose-500/20"
          : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
      }`}
      aria-label="Quantize"
      title={quantizeEnabled ? "Quantize On (snaps seek/cue to beat, sync to bar)" : "Quantize Off"}
    >
      Q
    </button>
  );

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
          <div className="flex items-center gap-2 pl-2">
            {quantizeButton}
            {cueButton}
          </div>
          <div className="flex items-center justify-center">{playButton}</div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-center">{playButton}</div>
          <div className="flex items-center justify-end gap-2 pr-2">
            {cueButton}
            {quantizeButton}
          </div>
        </>
      )}
    </div>
  );
}
