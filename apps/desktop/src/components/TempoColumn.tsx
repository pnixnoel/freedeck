import { useCallback, useMemo, useState } from "react";
import { usePointerValue } from "../hooks/usePointerValue";
import { TEMPO_COLUMN_WIDTH_PX } from "../lib/deckLayout";
import { formatPlayingBpm } from "../lib/formatAnalysis";
import {
  type TempoRange,
  RANGE_LIMITS,
  clampTempoToRange,
  pitchAdjustPercent,
  tempoFromVerticalPointer,
  tempoToFaderPercent,
} from "../lib/tempoColumn";

export type { TempoRange };

const TICK_COUNT = 10;

type TempoColumnProps = {
  tempo: number;
  nativeBpm?: number | null;
  keyLock?: boolean;
  onTempo: (ratio: number) => void;
  onKeyLockChange?: (enabled: boolean) => void;
  onNudge: (deltaSeconds: number) => void;
  onPitchBendStart?: (direction: -1 | 1) => void;
  onPitchBendEnd?: () => void;
  onSync?: () => void;
  syncEnabled?: boolean;
  syncActive?: boolean;
};

function syncButtonClass(syncEnabled: boolean, syncActive: boolean, hasHandler: boolean) {
  if (!syncEnabled || !hasHandler) {
    return "w-full cursor-not-allowed rounded border border-zinc-800 bg-zinc-900/50 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-600 opacity-50";
  }
  if (syncActive) {
    return "w-full rounded border border-sky-400/80 bg-sky-500/10 py-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.45)] ring-1 ring-sky-400/50 hover:bg-sky-500/20";
  }
  return "w-full rounded border border-zinc-600 bg-zinc-900 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-200 hover:bg-zinc-800";
}

function PitchBendButton({
  direction,
  onPitchBendStart,
  onPitchBendEnd,
  label,
}: {
  direction: -1 | 1;
  onPitchBendStart?: (direction: -1 | 1) => void;
  onPitchBendEnd?: () => void;
  label: string;
}) {
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onPitchBendStart?.(direction);
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    onPitchBendEnd?.();
  };

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
      className="flex h-7 w-7 touch-none items-center justify-center rounded text-base font-light text-zinc-400 hover:bg-zinc-700/60 hover:text-white"
      aria-label={label}
      title={label}
    >
      {direction === -1 ? "−" : "+"}
    </button>
  );
}

export function TempoColumn({
  tempo,
  nativeBpm = null,
  keyLock = true,
  onTempo,
  onKeyLockChange,
  onPitchBendStart,
  onPitchBendEnd,
  onSync,
  syncEnabled = false,
  syncActive = false,
}: TempoColumnProps) {
  const [range, setRange] = useState<TempoRange>("16");
  const [rangeOpen, setRangeOpen] = useState(false);
  const limits = RANGE_LIMITS[range];

  const mapPointer = useCallback(
    (_clientX: number, clientY: number, rect: DOMRect) =>
      tempoFromVerticalPointer({ clientY, rect: { top: rect.top, height: rect.height }, range }),
    [range],
  );

  const { trackRef, onPointerDown, onPointerMove, onPointerUp } = usePointerValue(
    tempo,
    onTempo,
    mapPointer,
  );

  const pct = tempoToFaderPercent(tempo, range);
  const pitchPct = pitchAdjustPercent(tempo);
  const atCenter = Math.abs(pitchPct) < 0.05;
  const bpm = formatPlayingBpm(nativeBpm, tempo);

  const ticks = useMemo(
    () => Array.from({ length: TICK_COUNT }, (_, i) => (i / (TICK_COUNT - 1)) * 100),
    [],
  );

  const handleRangeChange = (next: TempoRange) => {
    setRange(next);
    setRangeOpen(false);
    onTempo(clampTempoToRange(tempo, next));
  };

  return (
    <div
      className="flex min-h-[240px] shrink-0 flex-col rounded-md border border-zinc-600/60 bg-[#18181f] px-2 py-2 shadow-inner"
      style={{ width: TEMPO_COLUMN_WIDTH_PX }}
    >
      <button
        type="button"
        disabled={!syncEnabled || !onSync}
        onClick={onSync}
        className={syncButtonClass(syncEnabled, syncActive, Boolean(onSync))}
        aria-label={
          syncActive ? "Synced — press again to disable" : "Sync tempo and 4-bar phase to master"
        }
        aria-pressed={syncActive}
        title={
          syncActive
            ? "Synced — press again to disable"
            : syncEnabled
              ? "Sync tempo and 4-bar phase to master"
              : "Load BPM on both decks to sync"
        }
      >
        Sync
      </button>

      <div className="mt-1.5 flex w-full flex-col items-center leading-none">
        <span className="font-mono text-[11px] font-medium text-zinc-100">
          {bpm.playing === "--" ? "--" : bpm.playing}
        </span>
        <div className="relative mt-0.5 flex w-full items-center justify-center">
          <span className="font-mono text-[10px] text-zinc-300">
            {pitchPct >= 0 ? "+" : ""}
            {pitchPct.toFixed(1)} %
          </span>
          <button
            type="button"
            onClick={() => setRangeOpen((v) => !v)}
            className="absolute -right-0.5 flex items-center text-zinc-500 hover:text-zinc-300"
            aria-label="Tempo range"
            title={`Range: ${limits.label}`}
          >
            <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true">
              <path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          {rangeOpen ? (
            <div className="absolute right-0 top-full z-20 mt-1 min-w-[72px] rounded border border-zinc-700 bg-zinc-900 py-0.5 shadow-lg">
              {(Object.keys(RANGE_LIMITS) as TempoRange[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleRangeChange(key)}
                  className={`block w-full px-2 py-1 text-left text-[9px] uppercase ${
                    range === key ? "text-sky-300" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {RANGE_LIMITS[key].label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative mt-1.5 flex min-h-[180px] flex-1 w-full items-center justify-center">
        <div
          ref={trackRef}
          className="relative h-full w-full touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          role="slider"
          aria-label="Tempo"
          aria-valuemin={limits.min}
          aria-valuemax={limits.max}
          aria-valuenow={tempo}
        >
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-zinc-950" />

          {ticks.map((tickPct) => (
            <div
              key={tickPct}
              className="pointer-events-none absolute left-1/2 h-px w-6 -translate-x-1/2 bg-zinc-400/90"
              style={{ bottom: `${tickPct}%` }}
            />
          ))}

          <div
            className="pointer-events-none absolute left-0 right-0 flex items-center justify-between px-0.5"
            style={{ bottom: "calc(50% - 4px)" }}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                atCenter
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]"
                  : "bg-emerald-500/40 shadow-[0_0_4px_rgba(52,211,153,0.4)]"
              }`}
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onKeyLockChange?.(!keyLock);
              }}
              className={`pointer-events-auto flex h-4 w-4 items-center justify-center rounded-sm text-[11px] leading-none ${
                keyLock
                  ? "text-sky-400 hover:text-sky-300"
                  : "text-zinc-600 hover:text-zinc-400"
              }`}
              aria-pressed={keyLock}
              aria-label={keyLock ? "Key lock on" : "Key lock off"}
              title={keyLock ? "Key lock on" : "Key lock off (vinyl mode)"}
            >
              ♪
            </button>
          </div>

          <div
            className="pointer-events-none absolute left-1/2 h-3 w-9 -translate-x-1/2 rounded-sm bg-gradient-to-b from-zinc-400 to-zinc-600 shadow-[0_2px_4px_rgba(0,0,0,0.5)] ring-1 ring-zinc-500/80"
            style={{ bottom: `calc(${pct}% - 6px)` }}
          />
        </div>
      </div>

      <div className="mt-1 flex w-full items-center justify-between px-0.5">
        <PitchBendButton
          direction={-1}
          onPitchBendStart={onPitchBendStart}
          onPitchBendEnd={onPitchBendEnd}
          label="Pitch bend down"
        />
        <PitchBendButton
          direction={1}
          onPitchBendStart={onPitchBendStart}
          onPitchBendEnd={onPitchBendEnd}
          label="Pitch bend up"
        />
      </div>
    </div>
  );
}
