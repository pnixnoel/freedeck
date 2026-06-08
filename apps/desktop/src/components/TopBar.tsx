import { useEffect, useState } from "react";

type TopBarProps = {
  audioReady: boolean;
  geekDataOpen: boolean;
  onToggleGeekData: () => void;
};

export function TopBar({ audioReady, geekDataOpen, onToggleGeekData }: TopBarProps) {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = time.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#0d0d12] px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Settings"
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          title="Settings"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Record"
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          title="Record"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        </button>
        <span className="text-[10px] text-zinc-600">FX</span>
        <span className="text-[10px] text-zinc-600">Looper</span>
        <button
          type="button"
          onClick={onToggleGeekData}
          className={`rounded px-2 py-0.5 text-[10px] font-medium ${
            geekDataOpen
              ? "bg-violet-900/60 text-violet-200 ring-1 ring-violet-600/50"
              : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          }`}
          title="Live engine audio values (not UI knob positions)"
        >
          Data for geeks
        </button>
      </div>

      <div className="flex flex-col items-center">
        <span className="text-sm font-bold tracking-widest text-white">FREEDECK</span>
        <span className="text-[9px] text-zinc-600">
          {audioReady ? "Audio Ready" : "Starting..."}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-xs text-zinc-400" aria-label="Current time">
          {timeStr}
        </span>
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <span>View</span>
          <select
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300"
            defaultValue="two"
            aria-label="Deck view mode"
          >
            <option value="two">Two Decks</option>
            <option value="four">Four Decks</option>
          </select>
        </label>
      </div>
    </header>
  );
}
