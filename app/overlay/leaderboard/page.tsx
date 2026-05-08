"use client";
import { useEffect, useMemo, useState } from "react";
import { useResults } from "@/lib/useResults";
import { flagEmoji, formatDuration } from "@/lib/format";

export default function LeaderboardOverlay() {
  const { data } = useResults(15_000);
  const [topN, setTopN] = useState(10);
  const [cat, setCat] = useState<"all" | "Individual" | "Team">("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const n = Number(p.get("top"));
    if (Number.isFinite(n) && n > 0) setTopN(n);
    const c = p.get("cat");
    if (c === "Individual" || c === "Team") setCat(c);
  }, []);

  const rows = useMemo(() => {
    const all = data?.results ?? [];
    const filtered = cat === "all" ? all : all.filter((r) => r.Category === cat);
    return [...filtered].sort((a, b) => a.Rank - b.Rank).slice(0, topN);
  }, [data, cat, topN]);

  return (
    <div className="inline-block min-w-[520px] rounded-xl bg-black/70 p-4 text-white shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold uppercase tracking-wide">
          Leaderboard{cat !== "all" ? ` · ${cat}` : ""}
        </h2>
        <div className="text-xs text-white/60">Top {topN}</div>
      </div>
      <div>
        {rows.map((r, i) => (
          <div
            key={r.Bib}
            className="flex items-center gap-3 border-b border-white/10 py-1.5 last:border-0"
          >
            <div className="w-8 text-right font-mono text-mud-accent">
              {i + 1}
            </div>
            <div className="text-base">{flagEmoji(r.Nation)}</div>
            <div className="flex-1 truncate">
              <span className="font-semibold">{r.Name}</span>
              <span className="ml-2 text-xs text-white/60">#{r.Bib}</span>
            </div>
            <div className="font-mono text-sm">
              {r.laps}L · {r.distanceMiles}mi
            </div>
            <div className="font-mono text-xs text-white/60">
              {formatDuration(r.lastLapSec)}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-4 text-center text-sm text-white/60">
            Waiting for results…
          </div>
        )}
      </div>
    </div>
  );
}
