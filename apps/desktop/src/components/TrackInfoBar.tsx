import { formatRemaining } from "../lib/engine";
import { formatPlayingBpm } from "../lib/formatAnalysis";
import { OverviewWaveform } from "./OverviewWaveform";

export type DeckTrackInfo = {
  title: string;
  artist: string;
  bpm: number | null;
  key: string;
  beatgridOffset?: number;
};

type TrackInfoBarProps = {
  deckLabel: string;
  track: DeckTrackInfo | null;
  tempo?: number;
  keyLock?: boolean;
  position: number;
  duration: number;
  peaks: number[];
  accentColor: string;
  onSeek: (position: number) => void;
  onKeyLockChange?: (enabled: boolean) => void;
  onBpmDouble?: () => void;
  onBpmHalve?: () => void;
  isMaster?: boolean;
  masterManual?: boolean;
  onMasterClick?: () => void;
};

export function TrackInfoBar({
  deckLabel,
  track,
  tempo = 1,
  keyLock = true,
  position,
  duration,
  peaks,
  accentColor,
  onSeek,
  onKeyLockChange,
  onBpmDouble,
  onBpmHalve,
  isMaster = false,
  masterManual = false,
  onMasterClick,
}: TrackInfoBarProps) {
  const remaining = Math.max(0, duration - position);
  const bpm = formatPlayingBpm(track?.bpm ?? null, tempo);

  return (
    <div className="flex min-w-0 flex-col gap-1 border-b border-zinc-800/60 bg-[#0d0d12] px-3 py-2">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] font-bold text-zinc-500"
          aria-label="Album artwork"
        >
          {track ? track.title.charAt(0).toUpperCase() : "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
              {deckLabel}
            </span>
            {isMaster ? (
              <span className="rounded border border-amber-400/50 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-200">
                Master
              </span>
            ) : null}
            <span className="truncate text-sm font-semibold text-white">
              {track?.title ?? "No Track Loaded"}
            </span>
          </div>
          <span className="truncate text-xs text-zinc-500">
            {track?.artist ?? "—"}
          </span>
        </div>
        <div className="flex min-w-0 shrink items-center gap-2 text-xs">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1">
              <span className="text-[9px] uppercase text-zinc-600">Playing</span>
              {track?.bpm != null && track.bpm > 0 ? (
                <span className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={onBpmHalve}
                    className="rounded px-1 text-[9px] text-zinc-500 hover:text-white"
                    aria-label="Halve BPM"
                  >
                    ÷2
                  </button>
                  <button
                    type="button"
                    onClick={onBpmDouble}
                    className="rounded px-1 text-[9px] text-zinc-500 hover:text-white"
                    aria-label="Double BPM"
                  >
                    ×2
                  </button>
                </span>
              ) : null}
            </div>
            <span className="font-mono text-sm font-medium text-white">
              {bpm.playing}
            </span>
            {bpm.native != null ? (
              <span className="font-mono text-[10px] text-zinc-500">
                orig {bpm.native}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase text-zinc-600">Key</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-zinc-300">{track?.key ?? "--"}</span>
              <button
                type="button"
                onClick={() => onKeyLockChange?.(!keyLock)}
                className={
                  keyLock
                    ? "rounded border border-cyan-400/60 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-cyan-200"
                    : "rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-zinc-500"
                }
                aria-pressed={keyLock}
                aria-label={keyLock ? "Key lock on" : "Key lock off"}
              >
                Key
              </button>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase text-zinc-600">Lead</span>
            <button
              type="button"
              onClick={onMasterClick}
              disabled={!onMasterClick}
              className={
                isMaster && masterManual
                  ? "rounded border border-amber-400/60 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-100"
                  : isMaster
                    ? "rounded border border-amber-400/40 bg-amber-500/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-200/80"
                    : "rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-zinc-500 hover:text-zinc-300"
              }
              aria-pressed={isMaster && masterManual}
              aria-label={
                isMaster && masterManual
                  ? "Manual master — click to return to auto"
                  : isMaster
                    ? "Auto master deck"
                    : "Set as master deck"
              }
            >
              Lead
            </button>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase text-zinc-600">Remaining</span>
            <span className="font-mono text-sm font-light text-white">
              {duration > 0 ? formatRemaining(remaining) : "-0:00"}
            </span>
          </div>
        </div>
      </div>
      <div className="h-8 shrink-0 overflow-hidden rounded-sm">
        <OverviewWaveform
          peaks={peaks}
          position={position}
          duration={duration}
          color={accentColor}
          onSeek={onSeek}
        />
      </div>
    </div>
  );
}
