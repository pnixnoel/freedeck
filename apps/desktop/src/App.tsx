import { useCallback, useEffect, useRef, useState } from "react";
import { CenterMixerPanel } from "./components/CenterMixerPanel";
import { Deck } from "./components/Deck";
import { Library } from "./components/Library";
import { TopBar } from "./components/TopBar";
import { TrackInfoBar, type DeckTrackInfo } from "./components/TrackInfoBar";
import { useCrossfaderShortcuts } from "./hooks/useCrossfaderShortcuts";
import * as engine from "./lib/engine";
import { type SweepBarCount } from "./lib/crossfaderMotion";
import { doubleBpm, halveBpm } from "./lib/bpmOctave";
import { formatKey } from "./lib/formatAnalysis";
import { type LibraryTrack } from "./lib/mockLibrary";
import { applyPitchBend } from "./lib/pitchBend";
import { canSync, alignFollowerToMaster, effectiveBpm, resolveMasterDeck } from "./lib/sync";

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
  });

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
  const [masterDeck, setMasterDeck] = useState<0 | 1 | null>(null);
  const lastAutoMasterRef = useRef<0 | 1>(0);
  const bendBaseA = useRef<number | null>(null);
  const bendBaseB = useRef<number | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    (async () => {
      const started = await engine.startEngine();
      setReady(started);
      unlisten = await engine.onTelemetry((t) => {
        positionRefA.current = t.deck_a_position;
        positionRefB.current = t.deck_b_position;
        setTelemetry(t);
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

  const loadDeck = useCallback(async (deck: 0 | 1, libraryTrack?: LibraryTrack) => {
    if (deck === 0) {
      setPeaksA([]);
      setTrackA(null);
      setTempoA(1);
      setSyncEngagedA(false);
      await engine.setTempo(0, 1);
    } else {
      setPeaksB([]);
      setTrackB(null);
      setTempoB(1);
      setSyncEngagedB(false);
      await engine.setTempo(1, 1);
    }

    const path = await engine.pickAndLoadTrack(deck);
    if (!path) return;
    const meta = engine.titleFromPath(path);
    const info: DeckTrackInfo = {
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
    } else {
      setTrackB(updated);
      setPeaksB(peaks);
    }
  }, []);

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
      await engine.seek(followerDeck, result.seekPosition);
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
    ],
  );

  const togglePlay = useCallback(
    async (deck: 0 | 1) => {
      const playing =
        deck === 0 ? telemetry.deck_a_playing : telemetry.deck_b_playing;
      const willPlay = !playing;
      if (willPlay) {
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
      } else {
        setTempoB(base);
        engine.setTempo(1, base);
        bendBaseB.current = null;
      }
    },
    [],
  );

  const applyCrossfader = useCallback((value: number) => {
    const clamped = Math.max(-1, Math.min(1, value));
    setCrossfader(clamped);
    engine.setCrossfader(clamped);
  }, []);

  const adjustBpm = useCallback(
    (deck: 0 | 1, op: "double" | "halve") => {
      const track = deck === 0 ? trackA : trackB;
      const setter = deck === 0 ? setTrackA : setTrackB;
      if (!track?.bpm) return;
      const next = op === "double" ? doubleBpm(track.bpm) : halveBpm(track.bpm);
      if (next == null) return;
      setter({ ...track, bpm: next });
    },
    [trackA, trackB],
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

  useEffect(() => {
    if (syncEngagedA && resolvedMaster !== 0) {
      void applySyncToFollower(0);
    }
    if (syncEngagedB && resolvedMaster !== 1) {
      void applySyncToFollower(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only follow master tempo/BPM changes
  }, [masterTempo, masterNativeBpm, resolvedMaster, syncEngagedA, syncEngagedB]);

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
      <TopBar audioReady={ready} />

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
            engine.setEq(0, band, v);
          }}
          onEqB={(band, v) => {
            setEqB((prev) => {
              const next = [...prev] as [number, number, number];
              next[band] = v;
              return next;
            });
            engine.setEq(1, band, v);
          }}
          onFilterA={setFilterA}
          onFilterB={setFilterB}
          onTrimA={setTrimA}
          onTrimB={setTrimB}
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
