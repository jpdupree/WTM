"use client";
import { useMemo, useState } from "react";
import type { Result } from "@/lib/types";
import { flagEmoji, formatDuration } from "@/lib/format";

type SortKey = "Rank" | "laps" | "distanceMiles" | "lastLapSec" | "avgLapSec" | "Name";

const HEADERS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: "Rank", label: "Rank" },
  { key: "Name", label: "Runner" },
  { key: "laps", label: "Laps", right: true },
  { key: "distanceMiles", label: "Miles", right: true },
  { key: "lastLapSec", label: "Last Lap", right: true },
  { key: "avgLapSec", label: "Avg Lap", right: true },
];

export default function ResultsTable({
  results,
  highlightBibs = new Set<number>(),
}: {
  results: Result[];
  highlightBibs?: Set<number>;
}) {
  const [sort, setSort] = useState<SortKey>("Rank");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"all" | "Individual" | "Team">("all");

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = results.filter((r) => {
      if (cat !== "all" && r.Category !== cat) return false;
      if (!q) return true;
      return (
        r.Name.toLowerCase().includes(q) ||
        String(r.Bib).includes(q) ||
        r.Nation.toLowerCase().includes(q)
      );
    });
    const sgn = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = a[sort];
      const vb = b[sort];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sgn;
      return String(va).localeCompare(String(vb)) * sgn;
    });
  }, [results, sort, dir, query, cat]);

  const toggleSort = (k: SortKey) => {
    if (k === sort) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(k);
      setDir(k === "Name" ? "asc" : k === "Rank" ? "asc" : "desc");
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, bib, nation…"
          className="flex-1 min-w-[200px] rounded-md border border-mud-600 bg-mud-800 px-3 py-2 text-sm text-white placeholder:text-mud-400"
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value as typeof cat)}
          className="rounded-md border border-mud-600 bg-mud-800 px-3 py-2 text-sm text-white"
        >
          <option value="all">All categories</option>
          <option value="Individual">Individual</option>
          <option value="Team">Team</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-mud-600">
        <table className="w-full text-sm">
          <thead className="bg-mud-800 text-mud-400">
            <tr>
              {HEADERS.map((h) => (
                <th
                  key={h.key}
                  onClick={() => toggleSort(h.key)}
                  className={
                    "cursor-pointer select-none px-3 py-2 font-medium " +
                    (h.right ? "text-right" : "text-left")
                  }
                >
                  {h.label}
                  {sort === h.key ? (dir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const hit = highlightBibs.has(r.Bib);
              return (
                <tr
                  key={r.Bib}
                  className={
                    "border-t border-mud-700 " +
                    (hit ? "bg-mud-accent/15" : "hover:bg-mud-800")
                  }
                >
                  <td className="px-3 py-2 font-mono">{r.Rank}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{flagEmoji(r.Nation)}</span>
                      <span className="font-medium text-white">{r.Name}</span>
                      <span className="text-xs text-mud-400">#{r.Bib}</span>
                      <span className="rounded-full border border-mud-600 px-1.5 py-0.5 text-[10px] uppercase text-mud-400">
                        {r.Category}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{r.laps}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.distanceMiles}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatDuration(r.lastLapSec)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatDuration(r.avgLapSec)}
                  </td>
                  <td className="px-3 py-2 text-mud-400">
                    {r.LastSeen} <span className="text-mud-500">· {r.LastSeenTOD}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-mud-400">
        Showing {sorted.length} of {results.length}
      </div>
    </div>
  );
}
