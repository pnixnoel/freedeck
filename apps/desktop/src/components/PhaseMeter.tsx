import React from "react";

type PhaseMeterProps = {
  phaseError: number; // range: [-0.5, 0.5]
};

export function PhaseMeter({ phaseError }: PhaseMeterProps) {
  // Clamp phase error to [-0.5, 0.5]
  const error = Math.max(-0.5, Math.min(0.5, phaseError));
  
  // Calculate percentage offset from center (50%)
  // -0.5 maps to 0%, 0.0 maps to 50%, 0.5 maps to 100%
  const percent = (error + 0.5) * 100;
  
  const absError = Math.abs(error);
  
  // Green when lock is tight (<0.01), yellow for warning (<0.20), red for drift (>=0.20)
  let colorClass = "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"; 
  if (absError >= 0.20) {
    colorClass = "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]";
  } else if (absError >= 0.01) {
    colorClass = "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]";
  }

  return (
    <div className="relative flex w-full flex-col items-center py-1 mt-1">
      <div className="text-[8px] font-semibold uppercase tracking-wider text-zinc-500 mb-0.5">Phase</div>
      <div className="relative h-1.5 w-full rounded-full bg-zinc-950/80 ring-1 ring-zinc-800/40">
        {/* Center line */}
        <div className="absolute left-1/2 top-0 h-full w-[1.5px] -translate-x-1/2 bg-zinc-700/60" />
        
        {/* Indicator dot */}
        <div
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-75 ease-out ${colorClass}`}
          style={{ left: `${percent}%` }}
        />
      </div>
    </div>
  );
}
