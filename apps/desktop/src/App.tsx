import { useCallback, useEffect, useRef, useState } from "react";
import { CenterMixerPanel } from "./components/CenterMixerPanel";
import { Deck } from "./components/Deck";
import { Library } from "./components/Library";
import { GeekDataPanel } from "./components/GeekDataPanel";
import { TopBar } from "./components/TopBar";
import { TrackInfoBar, type DeckTrackInfo } from "./components/TrackInfoBar";
import { useCrossfaderShortcuts } from "./hooks/useCrossfaderShortcuts";
import * as engine from "./lib/engine";
import { type SweepBarCount } from "./lib/crossfaderMotion";
import { doubleBpm, halveBpm } from "./lib/bpmOctave";
import { formatKey } from "./lib/formatAnalysis";
import { type LibraryTrack } from "./lib/engine";
import { applyPitchBend } from "./lib/pitchBend";
import { canSync, alignFollowerToMaster, effectiveBpm, resolveMasterDeck, snapToBar, secondsPerBar } from "./lib/sync";

/** UI knob order is High/Mid/Low; engine bands are 0=low, 1=mid, 2=high. */
const UI_TO_ENGINE_EQ_BAND = [2, 1, 0] as const;

export default function App() {
  const [ready, setReady] = useState(false);
  const [telemetry, setTelemetry] = useState<engine.Telemetry>({
    deck_a_position: 0,
    deck_b_position: 0,
    deck_a_duration: 0,
    deck_b_duration: 0,
    deck_a_playing: false,
    deck_b_playing: false,
    output_left: 0,
    output_right: 0,
    crossfader: 0,
    crossfader_gain_a: 1,
    crossfader_gain_b: 0,
    deck_a_peak_left: 0,
    deck_a_peak_right: 0,
    deck_a_volume: 1,
    deck_a_trim_gain: 1,
    deck_a_filter: 0,
    deck_a_eq_low_db: 0,
    deck_a_eq_mid_db: 0,
    deck_a_eq_high_db: 0,
    deck_a_tempo: 1,
    deck_a_key_lock: true,
    deck_a_loaded: false,
    deck_a_synced: false,
    deck_a_is_master: false,
    deck_a_sync_phase_error: 0,
    deck_a_loop_active: false,
    deck_a_loop_start_seconds: 0,
    deck_a_loop_end_seconds: 0,
    deck_b_peak_left: 0,
    deck_b_peak_right: 0,
    deck_b_volume: 1,
    deck_b_trim_gain: 1,
    deck_b_filter: 0,
    deck_b_eq_low_db: 0,
    deck_b_eq_mid_db: 0,
    deck_b_eq_high_db: 0,
    deck_b_tempo: 1,
    deck_b_key_lock: true,
    deck_b_loaded: false,
    deck_b_synced: false,
    deck_b_is_master: false,
    deck_b_sync_phase_error: 0,
    deck_b_loop_active: false,
    deck_b_loop_start_seconds: 0,
    deck_b_loop_end_seconds: 0,
    master_deck: -1,
    buffer_size_ms: 0,
  });

  const [geekDataOpen, setGeekDataOpen] = useState(false);

  const positionRefA = useRef(0);
  const positionRefB = useRef(0);

  const [peaksA, setPeaksA] = useState<number[]>([]);
  const [peaksB, setPeaksB] = useState<number[]>([]);
  const [trackA, setTrackA] = useState<DeckTrackInfo | null>(null);
  const [trackB, setTrackB] = useState<DeckTrackInfo | null>(null);

  const [volumeA, setVolumeA] = useState(1);
  const [volumeB, setVolumeB] = useState(1);
  const [tempoA, setTempoA] = useState(1);
  const [tempoB, setTempoB] = useState(1);
  const [keyLockA, setKeyLockA] = useState(true);
  const [keyLockB, setKeyLockB] = useState(true);
  const [eqA, setEqA] = useState<[number, number, number]>([0, 0, 0]);
  const [eqB, setEqB] = useState<[number, number, number]>([0, 0, 0]);
  const [filterA, setFilterA] = useState(50);
  const [filterB, setFilterB] = useState(50);
  const [trimA, setTrimA] = useState(0);
  const [trimB, setTrimB] = useState(0);
  const [crossfader, setCrossfader] = useState(0);
  const [crossfaderSweepBars, setCrossfaderSweepBars] = useState<SweepBarCount>(8);
  const [syncEngagedA, setSyncEngagedA] = useState(false);
  const [syncEngagedB, setSyncEngagedB] = useState(false);
  const [quantizeA, setQuantizeA] = useState(false);
  const [quantizeB, setQuantizeB] = useState(false);
  const [masterDeck, setMasterDeck] = useState<0 | 1 | null>(null);
  const lastAutoMasterRef = useRef<0 | 1>(0);
  const bendBaseA = useRef<number | null>(null);
  const bendBaseB = useRef<number | null>(null);

  const [cuesA, setCuesA] = useState<(number | null)[]>(Array(8).fill(null));
  const [cuesB, setCuesB] = useState<(number | null)[]>(Array(8).fill(null));
  const [beatsA, setBeatsA] = useState<number[]>([]);
  const [beatsB, setBeatsB] = useState<number[]>([]);
  const [loopStartTempA, setLoopStartTempA] = useState<number | null>(null);
  const [loopStartTempB, setLoopStartTempB] = useState<number | null>(null);

  const snapToNearestBeat = (position: number, beats: number[]): number => {
    if (beats.length === 0) return position;
    let nearest = beats[0];
    let minDist = Math.abs(position - nearest);
    for (let i = 1; i < beats.length; i++) {
      const dist = Math.abs(position - beats[i]);
      if (dist < minDist) {
        minDist = dist;
        nearest = beats[i];
      }
    }
    return nearest;
  };

  const handleSetCue = async (deck: 0 | 1, index: number) => {
    const track = deck === 0 ? trackA : trackB;
    if (!track?.id) return;
    let pos = deck === 0 ? positionRefA.current : positionRefB.current;
    const isQuantized = deck === 0 ? quantizeA : quantizeB;
    if (isQuantized) {
      const beats = deck === 0 ? beatsA : beatsB;
      pos = snapToNearestBeat(pos, beats);
    }
    
    await engine.librarySetCue(track.id, index, pos);
    
    if (deck === 0) {
      const copy = [...cuesA];
      copy[index] = pos;
      setCuesA(copy);
    } else {
      const copy = [...cuesB];
      copy[index] = pos;
      setCuesB(copy);
    }
  };

  const handleCuePress = async (deck: 0 | 1, index: number) => {
    const cues = deck === 0 ? cuesA : cuesB;
    const pos = cues[index];
    if (pos !== null) {
      await engine.seek(deck, pos);
    } else {
      await handleSetCue(deck, index);
    }
  };

  const handleCueClear = async (deck: 0 | 1, index: number) => {
    const track = deck === 0 ? trackA : trackB;
    if (!track?.id) return;
    await engine.libraryDeleteCue(track.id, index);
    if (deck === 0) {
      const copy = [...cuesA];
      copy[index] = null;
      setCuesA(copy);
    } else {
      const copy = [...cuesB];
      copy[index] = null;
      setCuesB(copy);
    }
  };

  const handleLoopIn = async (deck: 0 | 1) => {
    let pos = deck === 0 ? positionRefA.current : positionRefB.current;
    const isQuantized = deck === 0 ? quantizeA : quantizeB;
    if (isQuantized) {
      const beats = deck === 0 ? beatsA : beatsB;
      pos = snapToNearestBeat(pos, beats);
    }
    if (deck === 0) {
      setLoopStartTempA(pos);
    } else {
      setLoopStartTempB(pos);
    }
  };

  const handleLoopOut = async (deck: 0 | 1) => {
    const start = deck === 0 ? loopStartTempA : loopStartTempB;
    if (start === null) return;
    
    let end = deck === 0 ? positionRefA.current : positionRefB.current;
    const isQuantized = deck === 0 ? quantizeA : quantizeB;
    if (isQuantized) {
      const beats = deck === 0 ? beatsA : beatsB;
      end = snapToNearestBeat(end, beats);
    }
    
    if (end <= start) return;
    
    await engine.setLoopPoints(deck, start, end);
    await engine.setLoopActive(deck, true);
  };

  const handleLoopActiveToggle = async (deck: 0 | 1) => {
    const active = deck === 0 ? telemetry.deck_a_loop_active : telemetry.deck_b_loop_active;
    await engine.setLoopActive(deck, !active);
  };

  const handleAutoLoop = async (deck: 0 | 1, loopBeats: number) => {
    let pos = deck === 0 ? positionRefA.current : positionRefB.current;
    const beats = deck === 0 ? beatsA : beatsB;
    
    pos = snapToNearestBeat(pos, beats);

    const track = deck === 0 ? trackA : trackB;
    const bpm = track?.bpm ?? 120.0;
    const beatDuration = 60.0 / bpm;
    const loopDuration = loopBeats * beatDuration;
    
    const end = pos + loopDuration;
    const isQuantized = deck === 0 ? quantizeA : quantizeB;
    const finalEnd = isQuantized ? snapToNearestBeat(end, beats) : end;

    await engine.setLoopPoints(deck, pos, finalEnd);
    await engine.setLoopActive(deck, true);
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    (async () => {
      const started = await engine.startEngine();
      if (started) {
        await engine.setVolume(0, 1);
        await engine.setVolume(1, 1);
        await engine.setFilter(0, 0);
        await engine.setFilter(1, 0);
        await engine.setTrim(0, 0);
        await engine.setTrim(1, 0);
      }
      setReady(started);
      unlisten = await engine.onTelemetry((t) => {
        positionRefA.current = t.deck_a_position;
        positionRefB.current = t.deck_b_position;
        setTelemetry(t);
        setTempoA(t.deck_a_tempo);
        setTempoB(t.deck_b_tempo);
      });
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (telemetry.deck_a_playing && !telemetry.deck_b_playing) {
      lastAutoMasterRef.current = 0;
    } else if (telemetry.deck_b_playing && !telemetry.deck_a_playing) {
      lastAutoMasterRef.current = 1;
    }
  }, [telemetry.deck_a_playing, telemetry.deck_b_playing]);

  const resolvedMaster = resolveMasterDeck({
    masterDeckOverride: masterDeck,
    playingA: telemetry.deck_a_playing,
    playingB: telemetry.deck_b_playing,
    lastAutoMaster: lastAutoMasterRef.current,
  });

  const syncDeckMixerToEngine = useCallback(
    async (deck: 0 | 1) => {
      if (deck === 0) {
        await engine.setVolume(0, volumeA);
        await engine.setFilter(0, (filterA - 50) / 50);
        await engine.setTrim(0, trimA);
        for (let band = 0; band < 3; band++) {
          await engine.setEq(0, UI_TO_ENGINE_EQ_BAND[band as 0 | 1 | 2], eqA[band]);
        }
      } else {
        await engine.setVolume(1, volumeB);
        await engine.setFilter(1, (filterB - 50) / 50);
        await engine.setTrim(1, trimB);
        for (let band = 0; band < 3; band++) {
          await engine.setEq(1, UI_TO_ENGINE_EQ_BAND[band as 0 | 1 | 2], eqB[band]);
        }
      }
    },
    [volumeA, volumeB, filterA, filterB, trimA, trimB, eqA, eqB],
  );

  const loadDeck = useCallback(async (deck: 0 | 1, libraryTrack?: LibraryTrack) => {
    await engine.setPlay(deck, false);

    if (deck === 0) {
      setPeaksA([]);
      setTrackA(null);
      setTempoA(1);
      setSyncEngagedA(false);
      setCuesA(Array(8).fill(null));
      setBeatsA([]);
      setLoopStartTempA(null);
      await engine.setTempo(0, 1);
      await engine.setQuantize(0, quantizeA);
    } else {
      setPeaksB([]);
      setTrackB(null);
      setTempoB(1);
      setSyncEngagedB(false);
      setCuesB(Array(8).fill(null));
      setBeatsB([]);
      setLoopStartTempB(null);
      await engine.setTempo(1, 1);
      await engine.setQuantize(1, quantizeB);
    }

    let path = libraryTrack?.path ?? null;
    if (!path) {
      path = await engine.pickAndLoadTrack(deck);
    } else {
      const ok = await engine.loadTrack(deck, path);
      if (!ok) return;
      await engine.libraryIncrementPlayCount(libraryTrack.id);
    }
    if (!path) return;

    const trackId = libraryTrack?.id ?? await engine.libraryGetTrackId(path);

    const meta = engine.titleFromPath(path);
    const info: DeckTrackInfo = {
      id: trackId,
      title: libraryTrack?.title ?? meta.title,
      artist: libraryTrack?.artist ?? meta.artist,
      bpm: libraryTrack?.bpm ?? null,
      key: libraryTrack?.key ?? "--",
    };
    if (deck === 0) setTrackA(info);
    else setTrackB(info);

    const [peaks, analysis] = await Promise.all([
      engine.getWaveformPeaks(deck),
      engine.getTrackAnalysis(deck),
    ]);

    const updated: DeckTrackInfo = {
      ...info,
      bpm: analysis?.bpm_valid ? analysis.bpm : info.bpm,
      key: analysis?.key_valid ? formatKey(analysis.key, true) : info.key,
      beatgridOffset: analysis?.beatgrid_offset_valid
        ? analysis.beatgrid_offset_seconds
        : 0,
    };

    if (deck === 0) {
      setTrackA(updated);
      setPeaksA(peaks);
      setBeatsA(analysis?.beats ?? []);
    } else {
      setTrackB(updated);
      setPeaksB(peaks);
      setBeatsB(analysis?.beats ?? []);
    }

    // Load cues
    try {
      const dbCues = await engine.libraryGetCues(trackId);
      const cueArray = Array(8).fill(null);
      for (const c of dbCues) {
        if (c.index >= 0 && c.index < 8) {
          cueArray[c.index] = c.position;
        }
      }
      if (deck === 0) setCuesA(cueArray);
      else setCuesB(cueArray);
    } catch (err) {
      console.error("Failed to load cues:", err);
    }

    if (deck === 0) {
      setVolumeA(1);
      await engine.setVolume(0, 1);
    } else {
      setVolumeB(1);
      await engine.setVolume(1, 1);
    }

    await syncDeckMixerToEngine(deck);
  }, [syncDeckMixerToEngine, quantizeA, quantizeB]);

  const applySyncToFollower = useCallback(
    async (followerDeck: 0 | 1) => {
      const master = resolveMasterDeck({
        masterDeckOverride: masterDeck,
        playingA: telemetry.deck_a_playing,
        playingB: telemetry.deck_b_playing,
        lastAutoMaster: lastAutoMasterRef.current,
      });
      if (followerDeck === master) return false;

      const followerTrack = followerDeck === 0 ? trackA : trackB;
      const masterTrack = master === 0 ? trackA : trackB;
      const followerTempo = followerDeck === 0 ? tempoA : tempoB;
      const masterTempo = master === 0 ? tempoA : tempoB;
      const followerPosition =
        followerDeck === 0 ? telemetry.deck_a_position : telemetry.deck_b_position;
      const masterPosition =
        master === 0 ? telemetry.deck_a_position : telemetry.deck_b_position;
      const followerDuration =
        followerDeck === 0 ? telemetry.deck_a_duration : telemetry.deck_b_duration;

      if (!canSync(followerTrack?.bpm ?? null, masterTrack?.bpm ?? null)) {
        if (followerDeck === 0) setSyncEngagedA(false);
        else setSyncEngagedB(false);
        return false;
      }

      const result = alignFollowerToMaster({
        masterPosition,
        masterNativeBpm: masterTrack!.bpm!,
        masterTempo,
        masterGridOffset: masterTrack?.beatgridOffset ?? 0,
        followerPosition,
        followerNativeBpm: followerTrack!.bpm!,
        followerTempo,
        followerGridOffset: followerTrack?.beatgridOffset ?? 0,
        followerDuration,
      });
      if (!result) return false;

      if (followerDeck === 0) {
        setTempoA(result.tempo);
        await engine.setTempo(0, result.tempo);
      } else {
        setTempoB(result.tempo);
        await engine.setTempo(1, result.tempo);
      }
      let seekPos = result.seekPosition;
      const quantizeEnabled = followerDeck === 0 ? quantizeA : quantizeB;
      if (quantizeEnabled && followerTrack && followerTrack.bpm) {
        const spbar = secondsPerBar(followerTrack.bpm);
        seekPos = snapToBar(seekPos, followerTrack.beatgridOffset ?? 0, spbar);
      }
      await engine.seek(followerDeck, seekPos);
      return true;
    },
    [
      masterDeck,
      telemetry.deck_a_playing,
      telemetry.deck_b_playing,
      telemetry.deck_a_position,
      telemetry.deck_b_position,
      telemetry.deck_a_duration,
      telemetry.deck_b_duration,
      trackA,
      trackB,
      tempoA,
      tempoB,
      quantizeA,
      quantizeB,
    ],
  );

  const togglePlay = useCallback(
    async (deck: 0 | 1) => {
      const playing =
        deck === 0 ? telemetry.deck_a_playing : telemetry.deck_b_playing;
      const willPlay = !playing;
      if (willPlay) {
        await syncDeckMixerToEngine(deck);
        const engaged = deck === 0 ? syncEngagedA : syncEngagedB;
        const master = resolveMasterDeck({
          masterDeckOverride: masterDeck,
          playingA: telemetry.deck_a_playing,
          playingB: telemetry.deck_b_playing,
          lastAutoMaster: lastAutoMasterRef.current,
        });
        if (engaged && deck !== master) {
          await applySyncToFollower(deck);
        }
      }
      await engine.setPlay(deck, willPlay);
    },
    [
      telemetry.deck_a_playing,
      telemetry.deck_b_playing,
      syncEngagedA,
      syncEngagedB,
      masterDeck,
      applySyncToFollower,
    ],
  );

  const nudgeDeck = useCallback(
    (deck: 0 | 1, delta: number) => {
      const positionRef = deck === 0 ? positionRefA : positionRefB;
      const duration =
        deck === 0 ? telemetry.deck_a_duration : telemetry.deck_b_duration;
      const next = Math.max(0, Math.min(duration, positionRef.current + delta));
      positionRef.current = next;
      engine.seek(deck, next);
    },
    [telemetry.deck_a_duration, telemetry.deck_b_duration],
  );

  const pitchBendStart = useCallback(
    (deck: 0 | 1, direction: -1 | 1) => {
      const base = deck === 0 ? tempoA : tempoB;
      if (deck === 0) bendBaseA.current = base;
      else bendBaseB.current = base;

      // Suspend engine-level phase locking during manual nudge
      void engine.setSync(deck, false);

      const bent = applyPitchBend(base, direction);
      if (deck === 0) {
        setTempoA(bent);
        engine.setTempo(0, bent);
      } else {
        setTempoB(bent);
        engine.setTempo(1, bent);
      }
    },
    [tempoA, tempoB],
  );

  const pitchBendEnd = useCallback(
    (deck: 0 | 1) => {
      const base = deck === 0 ? bendBaseA.current : bendBaseB.current;
      if (base == null) return;
      if (deck === 0) {
        setTempoA(base);
        engine.setTempo(0, base);
        bendBaseA.current = null;
        if (syncEngagedA) void engine.setSync(0, true);
      } else {
        setTempoB(base);
        engine.setTempo(1, base);
        bendBaseB.current = null;
        if (syncEngagedB) void engine.setSync(1, true);
      }
    },
    [syncEngagedA, syncEngagedB],
  );

  const applyCrossfader = useCallback((value: number) => {
    const clamped = Math.max(-1, Math.min(1, value));
    setCrossfader(clamped);
    engine.setCrossfader(clamped);
  }, []);

  const adjustBpm = useCallback(
    async (deck: 0 | 1, op: "double" | "halve") => {
      const track = deck === 0 ? trackA : trackB;
      const setter = deck === 0 ? setTrackA : setTrackB;
      if (!track?.bpm) return;
      const next = op === "double" ? doubleBpm(track.bpm) : halveBpm(track.bpm);
      if (next == null) return;
      setter({ ...track, bpm: next });
      await engine.setBeatgrid(deck, next, track.beatgridOffset ?? 0);
    },
    [trackA, trackB],
  );

  const nudgeGridOffset = useCallback(
    async (deck: 0 | 1, deltaSeconds: number) => {
      const track = deck === 0 ? trackA : trackB;
      const setter = deck === 0 ? setTrackA : setTrackB;
      if (!track?.bpm) return;
      const nextOffset = (track.beatgridOffset ?? 0) + deltaSeconds;
      setter({ ...track, beatgridOffset: nextOffset });
      await engine.setBeatgrid(deck, track.bpm, nextOffset);
    },
    [trackA, trackB],
  );

  const setDownbeat = useCallback(
    async (deck: 0 | 1) => {
      const track = deck === 0 ? trackA : trackB;
      const setter = deck === 0 ? setTrackA : setTrackB;
      if (!track?.bpm) return;
      const currentPos = deck === 0 ? telemetry.deck_a_position : telemetry.deck_b_position;
      setter({ ...track, beatgridOffset: currentPos });
      await engine.setBeatgrid(deck, track.bpm, currentPos);
    },
    [trackA, trackB, telemetry.deck_a_position, telemetry.deck_b_position],
  );

  const syncDeck = useCallback(
    (deck: 0 | 1) => {
      const engaged = deck === 0 ? syncEngagedA : syncEngagedB;
      if (engaged) {
        if (deck === 0) setSyncEngagedA(false);
        else setSyncEngagedB(false);
        return;
      }
      if (deck === 0) setSyncEngagedA(true);
      else setSyncEngagedB(true);
      void applySyncToFollower(deck);
    },
    [syncEngagedA, syncEngagedB, applySyncToFollower],
  );

  const toggleQuantize = useCallback(
    async (deck: 0 | 1) => {
      if (deck === 0) {
        const next = !quantizeA;
        setQuantizeA(next);
        await engine.setQuantize(0, next);
      } else {
        const next = !quantizeB;
        setQuantizeB(next);
        await engine.setQuantize(1, next);
      }
    },
    [quantizeA, quantizeB],
  );

  const toggleMaster = useCallback((deck: 0 | 1) => {
    if (masterDeck === deck) {
      setMasterDeck(null);
      return;
    }
    setMasterDeck(deck);
    if (deck === 0) setSyncEngagedA(false);
    else setSyncEngagedB(false);
  }, [masterDeck]);

  const masterTempo = resolvedMaster === 0 ? tempoA : tempoB;
  const masterNativeBpm =
    resolvedMaster === 0 ? trackA?.bpm ?? null : trackB?.bpm ?? null;

  // Map master deck to engine
  useEffect(() => {
    if (ready) {
      void engine.setMaster(resolvedMaster);
    }
  }, [resolvedMaster, ready]);

  // Map sync state to engine
  useEffect(() => {
    if (ready) {
      void engine.setSync(0, syncEngagedA);
    }
  }, [syncEngagedA, ready]);

  useEffect(() => {
    if (ready) {
      void engine.setSync(1, syncEngagedB);
    }
  }, [syncEngagedB, ready]);

  useEffect(() => {
    if (!canSync(trackA?.bpm ?? null, trackB?.bpm ?? null)) {
      setSyncEngagedA(false);
      setSyncEngagedB(false);
    }
  }, [trackA?.bpm, trackB?.bpm]);

  const effectiveBpmA = effectiveBpm(trackA?.bpm ?? null, tempoA);
  const effectiveBpmB = effectiveBpm(trackB?.bpm ?? null, tempoB);
  const syncActiveA = syncEngagedA && resolvedMaster !== 0;
  const syncActiveB = syncEngagedB && resolvedMaster !== 1;
  const syncEnabledA =
    canSync(trackA?.bpm ?? null, trackB?.bpm ?? null) && resolvedMaster !== 0;
  const syncEnabledB =
    canSync(trackA?.bpm ?? null, trackB?.bpm ?? null) && resolvedMaster !== 1;

  useCrossfaderShortcuts({
    sweepBars: crossfaderSweepBars,
    crossfaderPosition: crossfader,
    bpmInput: {
      bpmA: trackA?.bpm ?? null,
      bpmB: trackB?.bpm ?? null,
      tempoA,
      tempoB,
      playingA: telemetry.deck_a_playing,
      playingB: telemetry.deck_b_playing,
    },
    onCrossfader: applyCrossfader,
  });

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#08080c] text-zinc-100">
      <TopBar
        audioReady={ready}
        geekDataOpen={geekDataOpen}
        onToggleGeekData={() => setGeekDataOpen((v) => !v)}
      />
      <GeekDataPanel
        open={geekDataOpen}
        telemetry={telemetry}
        onClose={() => setGeekDataOpen(false)}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(380px,1.45fr)_minmax(260px,1.1fr)_minmax(380px,1.45fr)]">
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-x border-zinc-800/40 bg-[#16161f]">
          <TrackInfoBar
            deckLabel="Deck A"
            track={trackA}
            tempo={tempoA}
            keyLock={keyLockA}
            position={telemetry.deck_a_position}
            duration={telemetry.deck_a_duration}
            peaks={peaksA}
            accentColor="#ef4444"
            onSeek={(pos) => engine.seek(0, pos)}
            onKeyLockChange={(v) => {
              setKeyLockA(v);
              engine.setKeyLock(0, v);
            }}
            onBpmDouble={() => adjustBpm(0, "double")}
            onBpmHalve={() => adjustBpm(0, "halve")}
            onGridNudge={(delta) => nudgeGridOffset(0, delta)}
            onSetDownbeat={() => setDownbeat(0)}
            isMaster={resolvedMaster === 0}
            masterManual={masterDeck === 0}
            onMasterClick={() => toggleMaster(0)}
          />
          <Deck
            side="left"
            label="Deck A"
            position={telemetry.deck_a_position}
            duration={telemetry.deck_a_duration}
            playing={telemetry.deck_a_playing}
            trackTitle={trackA?.title}
            nativeBpm={trackA?.bpm ?? null}
            tempo={tempoA}
            syncEnabled={syncEnabledA}
            syncActive={syncActiveA}
            keyLock={keyLockA}
            onKeyLockChange={(v) => {
              setKeyLockA(v);
              engine.setKeyLock(0, v);
            }}
            onLoad={() => loadDeck(0)}
            onPlayToggle={() => togglePlay(0)}
            onCue={() => engine.cue(0)}
            onSync={() => syncDeck(0)}
            onTempo={(v) => {
              setTempoA(v);
              engine.setTempo(0, v);
            }}
            onNudge={(delta) => nudgeDeck(0, delta)}
            onPitchBendStart={(dir) => pitchBendStart(0, dir)}
            onPitchBendEnd={() => pitchBendEnd(0)}
            isMaster={resolvedMaster === 0}
            synced={telemetry.deck_a_synced}
            syncPhaseError={telemetry.deck_a_sync_phase_error}
            quantizeEnabled={quantizeA}
            onQuantizeToggle={() => toggleQuantize(0)}
            loopActive={telemetry.deck_a_loop_active}
            loopStartSeconds={telemetry.deck_a_loop_start_seconds}
            loopEndSeconds={telemetry.deck_a_loop_end_seconds}
            cuePoints={cuesA}
            onLoopIn={() => handleLoopIn(0)}
            onLoopOut={() => handleLoopOut(0)}
            onLoopActiveToggle={() => handleLoopActiveToggle(0)}
            onAutoLoop={(beats) => handleAutoLoop(0, beats)}
            onCuePress={(idx) => handleCuePress(0, idx)}
            onCueClear={(idx) => handleCueClear(0, idx)}
          />
        </div>

        <CenterMixerPanel
          peaksA={peaksA}
          peaksB={peaksB}
          bpmA={effectiveBpmA}
          bpmB={effectiveBpmB}
          beatgridOffsetA={trackA?.beatgridOffset ?? 0}
          beatgridOffsetB={trackB?.beatgridOffset ?? 0}
          positionRefA={positionRefA}
          positionRefB={positionRefB}
          durationA={telemetry.deck_a_duration}
          durationB={telemetry.deck_b_duration}
          playingA={telemetry.deck_a_playing}
          playingB={telemetry.deck_b_playing}
          onSeekA={(pos) => engine.seek(0, pos)}
          onSeekB={(pos) => engine.seek(1, pos)}
          crossfader={crossfader}
          eqA={eqA}
          eqB={eqB}
          filterA={filterA}
          filterB={filterB}
          trimA={trimA}
          trimB={trimB}
          volumeA={volumeA}
          volumeB={volumeB}
          outputLeft={telemetry.output_left}
          outputRight={telemetry.output_right}
          onCrossfader={applyCrossfader}
          crossfaderSweepBars={crossfaderSweepBars}
          onCrossfaderSweepBarsChange={setCrossfaderSweepBars}
          onEqA={(band, v) => {
            setEqA((prev) => {
              const next = [...prev] as [number, number, number];
              next[band] = v;
              return next;
            });
            engine.setEq(0, UI_TO_ENGINE_EQ_BAND[band], v);
          }}
          onEqB={(band, v) => {
            setEqB((prev) => {
              const next = [...prev] as [number, number, number];
              next[band] = v;
              return next;
            });
            engine.setEq(1, UI_TO_ENGINE_EQ_BAND[band], v);
          }}
          onFilterA={(v) => {
            setFilterA(v);
            engine.setFilter(0, (v - 50) / 50);
          }}
          onFilterB={(v) => {
            setFilterB(v);
            engine.setFilter(1, (v - 50) / 50);
          }}
          onTrimA={(v) => {
            setTrimA(v);
            engine.setTrim(0, v);
          }}
          onTrimB={(v) => {
            setTrimB(v);
            engine.setTrim(1, v);
          }}
          onVolumeA={(v) => {
            setVolumeA(v);
            engine.setVolume(0, v);
          }}
          onVolumeB={(v) => {
            setVolumeB(v);
            engine.setVolume(1, v);
          }}
        />

        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-x border-zinc-800/40 bg-[#16161f]">
          <TrackInfoBar
            deckLabel="Deck B"
            track={trackB}
            tempo={tempoB}
            keyLock={keyLockB}
            position={telemetry.deck_b_position}
            duration={telemetry.deck_b_duration}
            peaks={peaksB}
            accentColor="#3b82f6"
            onSeek={(pos) => engine.seek(1, pos)}
            onKeyLockChange={(v) => {
              setKeyLockB(v);
              engine.setKeyLock(1, v);
            }}
            onBpmDouble={() => adjustBpm(1, "double")}
            onBpmHalve={() => adjustBpm(1, "halve")}
            onGridNudge={(delta) => nudgeGridOffset(1, delta)}
            onSetDownbeat={() => setDownbeat(1)}
            isMaster={resolvedMaster === 1}
            masterManual={masterDeck === 1}
            onMasterClick={() => toggleMaster(1)}
          />
          <Deck
            side="right"
            label="Deck B"
            position={telemetry.deck_b_position}
            duration={telemetry.deck_b_duration}
            playing={telemetry.deck_b_playing}
            trackTitle={trackB?.title}
            nativeBpm={trackB?.bpm ?? null}
            tempo={tempoB}
            syncEnabled={syncEnabledB}
            syncActive={syncActiveB}
            keyLock={keyLockB}
            onKeyLockChange={(v) => {
              setKeyLockB(v);
              engine.setKeyLock(1, v);
            }}
            onLoad={() => loadDeck(1)}
            onPlayToggle={() => togglePlay(1)}
            onCue={() => engine.cue(1)}
            onSync={() => syncDeck(1)}
            onTempo={(v) => {
              setTempoB(v);
              engine.setTempo(1, v);
            }}
            onNudge={(delta) => nudgeDeck(1, delta)}
            onPitchBendStart={(dir) => pitchBendStart(1, dir)}
            onPitchBendEnd={() => pitchBendEnd(1)}
            isMaster={resolvedMaster === 1}
            synced={telemetry.deck_b_synced}
            syncPhaseError={telemetry.deck_b_sync_phase_error}
            quantizeEnabled={quantizeB}
            onQuantizeToggle={() => toggleQuantize(1)}
            loopActive={telemetry.deck_b_loop_active}
            loopStartSeconds={telemetry.deck_b_loop_start_seconds}
            loopEndSeconds={telemetry.deck_b_loop_end_seconds}
            cuePoints={cuesB}
            onLoopIn={() => handleLoopIn(1)}
            onLoopOut={() => handleLoopOut(1)}
            onLoopActiveToggle={() => handleLoopActiveToggle(1)}
            onAutoLoop={(beats) => handleAutoLoop(1, beats)}
            onCuePress={(idx) => handleCuePress(1, idx)}
            onCueClear={(idx) => handleCueClear(1, idx)}
          />
        </div>
      </div>

      <Library
        onLoadToDeck={loadDeck}
        activeDeckA={trackA?.title}
        activeDeckB={trackB?.title}
      />
    </div>
  );
}
