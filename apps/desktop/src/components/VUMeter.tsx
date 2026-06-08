type VUMeterProps = {
  label: string;
  level: number;
  height?: number;
};

export function VUMeter({ label, level, height = 96 }: VUMeterProps) {
  const pct = Math.min(100, Math.max(0, level * 200));

  return (
    <div className="flex flex-col items-center gap-1" aria-label={`${label} VU meter`}>
      <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <div
        className="relative w-2.5 overflow-hidden rounded-full bg-zinc-900"
        style={{ height }}
      >
        <div
          className="absolute bottom-0 w-full rounded-full bg-gradient-to-t from-emerald-600 via-yellow-400 to-red-500 transition-[height] duration-75"
          style={{ height: `${pct}%` }}
        />
      </div>
    </div>
  );
}
