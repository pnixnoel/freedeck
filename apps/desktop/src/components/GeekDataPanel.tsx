import { type ReactNode, useState, useEffect } from "react";
import { type Telemetry, getLicenseInfo, type LicenseInfo } from "../lib/engine";

type GeekDataPanelProps = {
  open: boolean;
  telemetry: Telemetry;
  onClose: () => void;
};

function fmt(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function fmtDbFromGain(gain: number): string {
  if (gain <= 0) return "-∞";
  return `${(20 * Math.log10(gain)).toFixed(1)} dB`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 text-[10px] leading-relaxed">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono text-zinc-200">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function DeckBlock({
  label,
  loaded,
  playing,
  position,
  duration,
  peakL,
  peakR,
  volume,
  trimGain,
  filter,
  eqLow,
  eqMid,
  eqHigh,
  tempo,
  keyLock,
  synced,
  isMaster,
  syncPhaseError,
}: {
  label: string;
  loaded: boolean;
  playing: boolean;
  position: number;
  duration: number;
  peakL: number;
  peakR: number;
  volume: number;
  trimGain: number;
  filter: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  tempo: number;
  keyLock: boolean;
  synced: boolean;
  isMaster: boolean;
  syncPhaseError: number;
}) {
  return (
    <Section title={label}>
      <Row label="loaded" value={loaded ? "yes" : "no"} />
      <Row label="playing" value={playing ? "yes" : "no"} />
      <Row label="position" value={`${fmt(position, 2)}s / ${fmt(duration, 2)}s`} />
      <Row label="peak L / R" value={`${fmt(peakL)} / ${fmt(peakR)}`} />
      <Row label="volume gain" value={fmt(volume)} />
      <Row label="trim gain" value={`${fmt(trimGain)} (${fmtDbFromGain(trimGain)})`} />
      <Row label="filter amt" value={fmt(filter)} />
      <Row label="eq low/mid/high" value={`${fmt(eqLow, 1)} / ${fmt(eqMid, 1)} / ${fmt(eqHigh, 1)} dB`} />
      <Row label="tempo ratio" value={fmt(tempo)} />
      <Row label="key lock" value={keyLock ? "on" : "off"} />
      <Row label="synced" value={synced ? "yes" : "no"} />
      <Row label="is master" value={isMaster ? "yes" : "no"} />
      <Row label="phase error" value={`${fmt(syncPhaseError)} beats`} />
    </Section>
  );
}

export function GeekDataPanel({ open, telemetry, onClose }: GeekDataPanelProps) {
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);

  useEffect(() => {
    if (open) {
      getLicenseInfo().then(setLicenseInfo);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close geek data panel"
        onClick={onClose}
      />
      <aside
        className="relative z-10 max-h-[calc(100vh-2rem)] w-[22rem] overflow-y-auto rounded-lg border border-zinc-700 bg-[#12121a] p-4 shadow-2xl"
        role="dialog"
        aria-labelledby="geek-data-title"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 id="geek-data-title" className="text-xs font-semibold uppercase tracking-wider text-white">
              Engine telemetry
            </h2>
            <p className="text-[9px] text-zinc-500">Live values from the C++ audio engine (~60 Hz)</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="space-y-4">
          <Section title="Master output">
            <Row label="peak L / R" value={`${fmt(telemetry.output_left)} / ${fmt(telemetry.output_right)}`} />
            <Row label="crossfader" value={fmt(telemetry.crossfader)} />
            <Row
              label="xf gain A / B"
              value={`${fmt(telemetry.crossfader_gain_a)} / ${fmt(telemetry.crossfader_gain_b)}`}
            />
            <Row label="master deck" value={telemetry.master_deck === -1 ? "none" : telemetry.master_deck === 0 ? "A" : "B"} />
            <Row label="buffer size" value={`${fmt(telemetry.buffer_size_ms, 1)} ms`} />
          </Section>

          {licenseInfo && (
            <Section title="Licensing & Dependencies">
              <Row
                label="Aubio (GPL-3.0)"
                value={licenseInfo.aubio_linked ? `linked (${licenseInfo.aubio_license})` : "not linked"}
              />
              <Row
                label="Essentia (AGPL-3.0)"
                value={licenseInfo.essentia_linked ? `linked (${licenseInfo.essentia_license})` : "not linked"}
              />
            </Section>
          )}

          <DeckBlock
            label="Deck A"
            loaded={telemetry.deck_a_loaded}
            playing={telemetry.deck_a_playing}
            position={telemetry.deck_a_position}
            duration={telemetry.deck_a_duration}
            peakL={telemetry.deck_a_peak_left}
            peakR={telemetry.deck_a_peak_right}
            volume={telemetry.deck_a_volume}
            trimGain={telemetry.deck_a_trim_gain}
            filter={telemetry.deck_a_filter}
            eqLow={telemetry.deck_a_eq_low_db}
            eqMid={telemetry.deck_a_eq_mid_db}
            eqHigh={telemetry.deck_a_eq_high_db}
            tempo={telemetry.deck_a_tempo}
            keyLock={telemetry.deck_a_key_lock}
            synced={telemetry.deck_a_synced}
            isMaster={telemetry.deck_a_is_master}
            syncPhaseError={telemetry.deck_a_sync_phase_error}
          />

          <DeckBlock
            label="Deck B"
            loaded={telemetry.deck_b_loaded}
            playing={telemetry.deck_b_playing}
            position={telemetry.deck_b_position}
            duration={telemetry.deck_b_duration}
            peakL={telemetry.deck_b_peak_left}
            peakR={telemetry.deck_b_peak_right}
            volume={telemetry.deck_b_volume}
            trimGain={telemetry.deck_b_trim_gain}
            filter={telemetry.deck_b_filter}
            eqLow={telemetry.deck_b_eq_low_db}
            eqMid={telemetry.deck_b_eq_mid_db}
            eqHigh={telemetry.deck_b_eq_high_db}
            tempo={telemetry.deck_b_tempo}
            keyLock={telemetry.deck_b_key_lock}
            synced={telemetry.deck_b_synced}
            isMaster={telemetry.deck_b_is_master}
            syncPhaseError={telemetry.deck_b_sync_phase_error}
          />
        </div>
      </aside>
    </div>
  );
}
