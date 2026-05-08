"use client";
import { useEffect, useMemo, useState } from "react";
import { useResults } from "@/lib/useResults";
import { flagEmoji, formatDuration } from "@/lib/format";

function envBibs(): number[] {
  return (process.env.NEXT_PUBLIC_TEAM_BIBS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export default function TeamOverlay() {
  const { data } = useResults("overall", 15_000);
  const [bibs, setBibs] = useState<number[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search).get("bibs");
    const fromQs = p
      ? p.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
      : null;
    setBibs(fromQs ?? envBibs());
  }, []);

  const team = useMemo(() => {
    const set = new Set(bibs);
    return (data?.results ?? [])
      .filter((r) => set.has(r.Bib))
      .sort((a, b) => a.Rank - b.Rank);
  }, [data, bibs]);

  return (
    <div className="inline-block min-w-[480px] rounded-xl bg-black/70 p-4 text-white shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold uppercase tracking-wide">My Team</h2>
        <div className="text-xs text-white/60">
          {team.length} runner{team.length === 1 ? "" : "s"}
        </div>
      </div>
      <div>
        {team.map((r) => (
          <div
            key={r.Bib}
            className="flex items-center gap-3 border-b border-white/10 py-2 last:border-0"
          >
            <div className="w-10 text-right font-mono text-mud-accent">
              #{r.Rank}
            </div>
            <div className="text-base">{flagEmoji(r.Nation)}</div>
            <div className="flex-1 truncate">
              <div className="font-semibold">{r.Name}</div>
              <div className="text-[11px] text-white/60">
                Bib #{r.Bib} · {r.LastSeen}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-base">{r.laps} laps</div>
              <div className="font-mono text-[11px] text-white/60">
                {r.distanceMiles} mi · last {formatDuration(r.lastLapSec)}
              </div>
            </div>
          </div>
        ))}
        {team.length === 0 && (
          <div className="py-4 text-center text-sm text-white/60">
            Add ?bibs=1234,5678 to the URL or set NEXT_PUBLIC_TEAM_BIBS.
          </div>
        )}
      </div>
    </div>
  );
}
