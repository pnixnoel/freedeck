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
  isMaster?: boolean;
  synced?: boolean;
  syncPhaseError?: number;
  quantizeEnabled?: boolean;
  onQuantizeToggle?: () => void;

  // Loops and Hot Cues
  loopActive: boolean;
  loopStartSeconds: number;
  loopEndSeconds: number;
  cuePoints: (number | null)[];
  onLoopIn: () => void;
  onLoopOut: () => void;
  onLoopActiveToggle: () => void;
  onAutoLoop: (beats: number) => void;
  onCuePress: (index: number) => void;
  onCueClear: (index: number) => void;
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
  isMaster = false,
  synced = false,
  syncPhaseError = 0,
  quantizeEnabled = false,
  onQuantizeToggle,

  loopActive,
  loopStartSeconds,
  loopEndSeconds,
  cuePoints,
  onLoopIn,
  onLoopOut,
  onLoopActiveToggle,
  onAutoLoop,
  onCuePress,
  onCueClear,
}: DeckProps) {
  const gridColumns = deckGridColumns(side);

  const loadButton = (
    <button
      type="button"
      onClick={onLoad}
      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
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
      isMaster={isMaster}
      synced={synced}
      syncPhaseError={syncPhaseError}
    />
  );

  const jogWheelAndPerformance = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-between gap-3">
      {/* Jog Wheel */}
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

      {/* Performance Panel */}
      <div className="flex shrink-0 flex-col gap-2.5 border-t border-zinc-800/60 pt-2.5">
        {/* Loop Controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onLoopIn}
              className="rounded border border-zinc-700 bg-zinc-900/60 px-2 py-1 text-[9px] font-bold text-zinc-300 hover:bg-zinc-850 cursor-pointer active:scale-95 transition-transform"
            >
              IN
            </button>
            <button
              type="button"
              onClick={onLoopOut}
              className="rounded border border-zinc-700 bg-zinc-900/60 px-2 py-1 text-[9px] font-bold text-zinc-300 hover:bg-zinc-850 cursor-pointer active:scale-95 transition-transform"
            >
              OUT
            </button>
            <button
              type="button"
              onClick={onLoopActiveToggle}
              className={`rounded border px-2 py-1 text-[9px] font-bold transition-all cursor-pointer ${
                loopActive
                  ? "border-amber-500 bg-amber-500/10 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.35)] ring-1 ring-amber-500/10"
                  : "border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-850"
              }`}
            >
              ACTIVE
            </button>
          </div>
          {/* Quick Loops */}
          <div className="flex items-center gap-1">
            {[1, 2, 4, 8, 16].map((beats) => (
              <button
                key={beats}
                type="button"
                onClick={() => onAutoLoop(beats)}
                className="rounded border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white px-2 py-0.5 text-[9px] font-mono font-semibold cursor-pointer active:scale-95 transition-transform"
              >
                {beats}
              </button>
            ))}
          </div>
        </div>

        {/* Hot Cue Pads */}
        <div className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: 8 }).map((_, idx) => {
            const cue = cuePoints[idx];
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onCuePress(idx)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onCueClear(idx);
                }}
                className={`relative flex h-8 flex-col items-center justify-center rounded border transition-all duration-150 cursor-pointer active:scale-95 ${
                  cue !== null
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-200 shadow-[0_0_6px_rgba(16,185,129,0.3)] ring-1 ring-emerald-500/10"
                    : "border-zinc-800 bg-zinc-900/40 text-zinc-600 hover:bg-zinc-800/60 hover:text-zinc-500"
                }`}
                title={cue !== null ? `Cue at ${cue.toFixed(2)}s (Right-click to clear)` : `Set Cue ${idx + 1}`}
              >
                <span className="text-[8px] font-bold">{idx + 1}</span>
                {cue !== null && (
                  <span className="absolute bottom-0.5 text-[6px] font-mono opacity-85 scale-90">
                    {cue.toFixed(1)}s
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
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
              {jogWheelAndPerformance}
              {tempoColumn}
            </>
          ) : (
            <>
              {tempoColumn}
              {jogWheelAndPerformance}
            </>
          )}
        </div>

        <Transport
          side={side}
          gridColumns={gridColumns}
          playing={playing}
          onCue={onCue}
          onPlayToggle={onPlayToggle}
          quantizeEnabled={quantizeEnabled}
          onQuantizeToggle={onQuantizeToggle}
        />
      </div>
    </section>
  );
}
