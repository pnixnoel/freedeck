import { useMemo, useState } from "react";
import { LIBRARY_TRACKS, PLAYLISTS, type LibraryTrack } from "../lib/mockLibrary";

type LibraryProps = {
  onLoadToDeck: (deck: 0 | 1, track?: LibraryTrack) => void;
  activeDeckA?: string | null;
  activeDeckB?: string | null;
};

export function Library({ onLoadToDeck, activeDeckA, activeDeckB }: LibraryProps) {
  const [playlistId, setPlaylistId] = useState("recent");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetDeck, setTargetDeck] = useState<0 | 1>(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return LIBRARY_TRACKS;
    return LIBRARY_TRACKS.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        t.genre.toLowerCase().includes(q),
    );
  }, [search]);

  const handleRowDoubleClick = (track: LibraryTrack) => {
    setSelectedId(track.id);
    onLoadToDeck(targetDeck, track);
  };

  const isActive = (track: LibraryTrack) =>
    track.title === activeDeckA || track.title === activeDeckB;

  return (
    <section
      className="flex h-[24vh] min-h-[120px] shrink-0 flex-col border-t border-zinc-800/80 bg-[#0a0a0f]"
      aria-label="Music library"
    >
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-40 shrink-0 flex-col border-r border-zinc-800/60 bg-[#0d0d12]">
          <div className="border-b border-zinc-800/60 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Sources
            </span>
          </div>
          <ul className="px-2 py-1">
            {["Local Library", "Apple Music", "Tidal"].map((src) => (
              <li key={src} className="rounded px-2 py-0.5 text-[11px] text-zinc-600">
                {src}
              </li>
            ))}
          </ul>
          <div className="border-t border-zinc-800/60 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Playlists
            </span>
          </div>
          <ul className="flex-1 overflow-y-auto px-2 py-1">
            {PLAYLISTS.map((pl) => (
              <li key={pl.id}>
                <button
                  type="button"
                  onClick={() => setPlaylistId(pl.id)}
                  className={`w-full rounded px-2 py-0.5 text-left text-[11px] ${
                    playlistId === pl.id
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  {pl.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-zinc-800/60 px-3 py-1.5">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Library
              </span>
              <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                Load to
                <select
                  value={targetDeck}
                  onChange={(e) => setTargetDeck(Number(e.target.value) as 0 | 1)}
                  className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-300"
                  aria-label="Target deck for load"
                >
                  <option value={0}>Deck A</option>
                  <option value={1}>Deck B</option>
                </select>
              </label>
            </div>
            <input
              type="search"
              placeholder="Search library..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600"
              aria-label="Search library"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-[#0d0d12] text-[9px] uppercase tracking-wider text-zinc-600">
                <tr>
                  <th className="px-3 py-1 font-medium">Title</th>
                  <th className="px-3 py-1 font-medium">Artist</th>
                  <th className="px-3 py-1 font-medium">Album</th>
                  <th className="px-3 py-1 font-medium">Genre</th>
                  <th className="px-3 py-1 font-medium">Time</th>
                  <th className="px-3 py-1 font-medium">BPM</th>
                  <th className="px-3 py-1 font-medium">Key</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((track) => (
                  <tr
                    key={track.id}
                    onClick={() => setSelectedId(track.id)}
                    onDoubleClick={() => handleRowDoubleClick(track)}
                    className={`cursor-pointer border-b border-zinc-900/60 ${
                      selectedId === track.id || isActive(track)
                        ? "bg-red-900/40 text-white"
                        : "text-zinc-400 hover:bg-zinc-900/60"
                    }`}
                    title="Double-click to load to target deck"
                  >
                    <td className="px-3 py-1">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-800 text-[8px] text-zinc-500">
                          {track.title.charAt(0)}
                        </span>
                        {track.title}
                      </div>
                    </td>
                    <td className="px-3 py-1">{track.artist}</td>
                    <td className="px-3 py-1">{track.album}</td>
                    <td className="px-3 py-1">{track.genre}</td>
                    <td className="px-3 py-1 font-mono">{track.duration}</td>
                    <td className="px-3 py-1 font-mono">{track.bpm}</td>
                    <td className="px-3 py-1 font-mono">{track.key}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
