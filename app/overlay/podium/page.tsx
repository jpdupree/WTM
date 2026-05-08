"use client";
import { useEffect, useMemo, useState } from "react";
import { useResults } from "@/lib/useResults";
import { flagEmoji, formatDuration } from "@/lib/format";
import type { FeedKey } from "@/lib/types";

const FEED_LABEL: Record<FeedKey, string> = {
  overall: "Overall",
  men: "Men",
  women: "Women",
  teams: "Teams",
};

function parseFeed(s: string | null): FeedKey {
  if (s === "men" || s === "women" || s === "teams" || s === "overall") return s;
  return "women";
}

export default function PodiumOverlay() {
  const [feed, setFeed] = useState<FeedKey>("women");
  const [topN, setTopN] = useState(10);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    setFeed(parseFeed(p.get("feed")));
    const n = Number(p.get("top"));
    if (Number.isFinite(n) && n > 0) setTopN(n);
  }, []);

  const { data } = useResults(feed, 15_000);

  const rows = useMemo(() => {
    const all = data?.results ?? [];
    return [...all].sort((a, b) => a.Rank - b.Rank).slice(0, topN);
  }, [data, topN]);

  return (
    <div className="inline-block min-w-[640px] rounded-2xl bg-gradient-to-b from-black/85 to-black/65 p-5 text-white shadow-2xl backdrop-blur">
      <div className="mb-4 flex items-baseline justify-between border-b border-white/15 pb-2">
        <h2 className="text-2xl font-bold uppercase tracking-wider">
          {FEED_LABEL[feed]} · Top {topN}
        </h2>
        <div className="text-xs uppercase tracking-wide text-mud-accent">
          World&rsquo;s Toughest Mudder
        </div>
      </div>
      <ol className="space-y-1.5">
        {rows.map((r, i) => {
          const place = i + 1;
          const medalColor =
            place === 1
              ? "text-yellow-300"
              : place === 2
              ? "text-zinc-300"
              : place === 3
              ? "text-amber-500"
              : "text-mud-accent";
          return (
            <li
              key={`${r.Bib}-${i}`}
              className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2"
            >
              <div
                className={`w-10 text-center font-mono text-2xl font-extrabold ${medalColor}`}
              >
                {place}
              </div>
              <div className="text-2xl">{flagEmoji(r.Nation)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-semibold">{r.Name}</div>
                <div className="text-[11px] uppercase tracking-wide text-white/50">
                  Bib #{r.Bib}
                  {r.Overall != null && (
                    <span> · Overall {r.Overall}</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xl font-bold">
                  {r.laps}
                  <span className="ml-1 text-xs font-normal text-white/60">laps</span>
                </div>
                <div className="font-mono text-[11px] text-white/60">
                  {r.distanceMiles} mi
                </div>
              </div>
              <div className="w-20 text-right">
                <div className="text-[10px] uppercase tracking-wide text-white/50">
                  Gap
                </div>
                <div className="font-mono text-base">
                  {r.diffMiles == null
                    ? "—"
                    : r.diffMiles === 0
                    ? "leader"
                    : `-${r.diffMiles} mi`}
                </div>
              </div>
              <div className="hidden w-20 text-right md:block">
                <div className="text-[10px] uppercase tracking-wide text-white/50">
                  Last
                </div>
                <div className="font-mono text-sm">
                  {formatDuration(r.lastLapSec)}
                </div>
              </div>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="py-6 text-center text-sm text-white/60">
            Waiting for results…
          </li>
        )}
      </ol>
    </div>
  );
}
