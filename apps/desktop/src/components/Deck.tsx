import { deckGridColumns, DECK_GRID_GAP_PX } from "../lib/deckLayout";
import { JogWheel } from "./JogWheel";
import { TempoColumn } from "./TempoColumn";
import { Transport } from "./Transport";

type DeckProps = {
  side: "left" | "right";
  label: string;
  position: number;
  duration: number;
  playing: boolean;
  trackTitle?: string;
  nativeBpm?: number | null;
  tempo: number;
  onLoad: () => void;
  onPlayToggle: () => void;
  onCue: () => void;
  onSync?: () => void;
  syncEnabled?: boolean;
  syncActive?: boolean;
  keyLock?: boolean;
  onKeyLockChange?: (enabled: boolean) => void;
  onTempo: (ratio: number) => void;
  onNudge: (deltaSeconds: number) => void;
  onPitchBendStart?: (direction: -1 | 1) => void;
  onPitchBendEnd?: () => void;
};

export function Deck({
  side,
  label,
  position,
  duration,
  playing,
  trackTitle,
  nativeBpm = null,
  tempo,
  onLoad,
  onPlayToggle,
  onCue,
  onSync,
  syncEnabled = false,
  syncActive = false,
  keyLock = true,
  onKeyLockChange,
  onTempo,
  onNudge,
  onPitchBendStart,
  onPitchBendEnd,
}: DeckProps) {
  const gridColumns = deckGridColumns(side);

  const loadButton = (
    <button
      type="button"
      onClick={onLoad}
      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-white"
      aria-label={`Load track on ${label}`}
    >
      Load Track
    </button>
  );

  const tempoColumn = (
    <TempoColumn
      tempo={tempo}
      nativeBpm={nativeBpm}
      keyLock={keyLock}
      onTempo={onTempo}
      onKeyLockChange={onKeyLockChange}
      onNudge={onNudge}
      onPitchBendStart={onPitchBendStart}
      onPitchBendEnd={onPitchBendEnd}
      onSync={onSync}
      syncEnabled={syncEnabled}
      syncActive={syncActive}
    />
  );

  const jogWheel = (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center [container-type:size]">
      <JogWheel
        position={position}
        duration={duration}
        playing={playing}
        tempo={tempo}
        trackTitle={trackTitle}
        deckLabel={label}
        onNudge={onNudge}
      />
    </div>
  );

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-x border-zinc-800/40 bg-[#16161f] p-3"
      aria-label={label}
    >
      <div
        className={`mb-2 flex items-center justify-between ${
          side === "right" ? "flex-row-reverse" : ""
        }`}
      >
        {loadButton}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
      </div>

      <div className="deck-controls flex min-h-0 flex-1 flex-col">
        <div
          className="deck-controls-inner grid min-h-0 flex-1"
          style={{ gridTemplateColumns: gridColumns, gap: DECK_GRID_GAP_PX }}
        >
          {side === "left" ? (
            <>
              {jogWheel}
              {tempoColumn}
            </>
          ) : (
            <>
              {tempoColumn}
              {jogWheel}
            </>
          )}
        </div>

        <Transport
          side={side}
          gridColumns={gridColumns}
          playing={playing}
          onCue={onCue}
          onPlayToggle={onPlayToggle}
        />
      </div>
    </section>
  );
}
