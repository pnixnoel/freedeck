import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

export type Telemetry = {
  deck_a_position: number;
  deck_b_position: number;
  deck_a_duration: number;
  deck_b_duration: number;
  deck_a_playing: boolean;
  deck_b_playing: boolean;
  output_left: number;
  output_right: number;
  crossfader: number;
  crossfader_gain_a: number;
  crossfader_gain_b: number;
  deck_a_peak_left: number;
  deck_a_peak_right: number;
  deck_a_volume: number;
  deck_a_trim_gain: number;
  deck_a_filter: number;
  deck_a_eq_low_db: number;
  deck_a_eq_mid_db: number;
  deck_a_eq_high_db: number;
  deck_a_tempo: number;
  deck_a_key_lock: boolean;
  deck_a_loaded: boolean;
  deck_b_peak_left: number;
  deck_b_peak_right: number;
  deck_b_volume: number;
  deck_b_trim_gain: number;
  deck_b_filter: number;
  deck_b_eq_low_db: number;
  deck_b_eq_mid_db: number;
  deck_b_eq_high_db: number;
  deck_b_tempo: number;
  deck_b_key_lock: boolean;
  deck_b_loaded: boolean;
};

export type TrackMeta = {
  title: string;
  artist: string;
  path: string;
};

export type TrackAnalysis = {
  bpm: number;
  bpm_valid: boolean;
  key: string;
  key_valid: boolean;
  beatgrid_offset_seconds: number;
  beatgrid_offset_valid: boolean;
};

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch {
    return null;
  }
}

export async function startEngine(): Promise<boolean> {
  const result = await safeInvoke<boolean>("engine_start");
  return result ?? false;
}

export async function loadTrack(deck: 0 | 1, path: string): Promise<boolean> {
  const result = await safeInvoke<boolean>("engine_load_track", { deck, path });
  return result ?? false;
}

export async function pickAndLoadTrack(deck: 0 | 1): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Audio",
          extensions: ["mp3", "wav", "aiff", "aif", "flac", "m4a", "ogg"],
        },
      ],
    });
    if (!selected || Array.isArray(selected)) return null;
    const ok = await loadTrack(deck, selected);
    return ok ? selected : null;
  } catch {
    return null;
  }
}

export async function setPlay(deck: 0 | 1, playing: boolean): Promise<void> {
  await safeInvoke("engine_set_play", { deck, playing });
}

export async function cue(deck: 0 | 1): Promise<void> {
  await safeInvoke("engine_cue", { deck });
}

export async function seek(deck: 0 | 1, positionSeconds: number): Promise<void> {
  await safeInvoke("engine_seek", { deck, positionSeconds });
}

export async function setVolume(deck: 0 | 1, gain: number): Promise<void> {
  await safeInvoke("engine_set_volume", { deck, gain });
}

export async function setEq(
  deck: 0 | 1,
  band: 0 | 1 | 2,
  gainDb: number,
): Promise<void> {
  await safeInvoke("engine_set_eq", { deck, band, gainDb });
}

export async function setFilter(deck: 0 | 1, amount: number): Promise<void> {
  await safeInvoke("engine_set_filter", { deck, amount });
}

export async function setTrim(deck: 0 | 1, gainDb: number): Promise<void> {
  await safeInvoke("engine_set_trim", { deck, gainDb });
}

export async function setTempo(deck: 0 | 1, ratio: number): Promise<void> {
  await safeInvoke("engine_set_tempo", { deck, ratio });
}

export async function setKeyLock(deck: 0 | 1, enabled: boolean): Promise<void> {
  await safeInvoke("engine_set_key_lock", { deck, enabled });
}

export async function setCrossfader(position: number): Promise<void> {
  await safeInvoke("engine_set_crossfader", { position });
}

export async function getWaveformPeaks(deck: 0 | 1): Promise<number[]> {
  const result = await safeInvoke<number[]>("engine_waveform_peaks", { deck });
  return result ?? [];
}

export async function getTrackAnalysis(deck: 0 | 1): Promise<TrackAnalysis | null> {
  return safeInvoke<TrackAnalysis>("engine_track_analysis", { deck });
}

export async function onTelemetry(
  handler: (telemetry: Telemetry) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => {};
  }
  try {
    return await listen<Telemetry>("telemetry", (event) => handler(event.payload));
  } catch {
    return () => {};
  }
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatRemaining(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "-0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `-${m}:${s.toString().padStart(2, "0")}`;
}

export function titleFromPath(path: string): TrackMeta {
  const filename = path.split(/[/\\]/).pop() ?? path;
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const parts = base.split(" - ");
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim(), path };
  }
  return { artist: "Unknown Artist", title: base, path };
}
