"use client";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import StatTile from "@/components/StatTile";
import { useResults } from "@/lib/useResults";
import { flagEmoji, formatDuration } from "@/lib/format";
import type { Result } from "@/lib/types";

function envBibs(): number[] {
  return (process.env.NEXT_PUBLIC_TEAM_BIBS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function paramBibs(): number[] | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search).get("bibs");
  if (!p) return null;
  return p
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export default function TeamView() {
  const { data, isLoading } = useResults(30_000);
  const [bibs, setBibs] = useState<number[]>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    const url = paramBibs();
    setBibs(url ?? envBibs());
  }, []);

  const team = useMemo(() => {
    const set = new Set(bibs);
    return (data?.results ?? []).filter((r) => set.has(r.Bib));
  }, [data, bibs]);

  const teamStats = useMemo(() => {
    const totalLaps = team.reduce((s, r) => s + r.laps, 0);
    const totalMiles = team.reduce((s, r) => s + r.distanceMiles, 0);
    const bestRank = team.length ? Math.min(...team.map((r) => r.Rank)) : 0;
    return { totalLaps, totalMiles, bestRank };
  }, [team]);

  const onAdd = () => {
    const n = Number(input.trim());
    if (Number.isFinite(n) && n > 0 && !bibs.includes(n)) {
      setBibs([...bibs, n]);
      setInput("");
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">My Team</h1>
          <p className="text-mud-400">
            {bibs.length === 0
              ? "Add bib numbers below or set NEXT_PUBLIC_TEAM_BIBS in .env"
              : `Tracking bibs: ${bibs.join(", ")}`}
          </p>
        </div>
        <Link
          href="/"
          className="rounded-md border border-mud-600 bg-mud-800 px-3 py-2 text-sm hover:bg-mud-700"
        >
          ← Full dashboard
        </Link>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder="Add bib #"
          className="w-32 rounded-md border border-mud-600 bg-mud-800 px-3 py-2 text-sm text-white placeholder:text-mud-400"
        />
        <button
          onClick={onAdd}
          className="rounded-md border border-mud-600 bg-mud-700 px-3 py-2 text-sm hover:bg-mud-600"
        >
          Add
        </button>
        {bibs.length > 0 && (
          <button
            onClick={() => setBibs([])}
            className="rounded-md border border-mud-600 bg-mud-800 px-3 py-2 text-sm text-mud-400 hover:bg-mud-700"
          >
            Clear
          </button>
        )}
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Team laps" value={teamStats.totalLaps} />
        <StatTile label="Team miles" value={teamStats.totalMiles} />
        <StatTile
          label="Best rank"
          value={teamStats.bestRank || "—"}
          accent
        />
      </section>

      {isLoading && !data ? (
        <div className="rounded-md border border-mud-600 bg-mud-800 p-8 text-center text-mud-400">
          Loading…
        </div>
      ) : team.length === 0 ? (
        <div className="rounded-md border border-mud-600 bg-mud-800 p-8 text-center text-mud-400">
          No tracked runners found in current results.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {team.map((r) => (
            <RunnerCard key={r.Bib} r={r} />
          ))}
        </div>
      )}
    </main>
  );
}

function RunnerCard({ r }: { r: Result }) {
  const onRemove = () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const current = (params.get("bibs") ?? "").split(",").filter(Boolean);
    const next = current.filter((b) => Number(b) !== r.Bib);
    if (next.length) params.set("bibs", next.join(","));
    else params.delete("bibs");
    window.location.search = params.toString();
  };
  return (
    <div className="rounded-lg border border-mud-600 bg-mud-800 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{flagEmoji(r.Nation)}</span>
          <h2 className="text-xl font-bold text-white">{r.Name}</h2>
          <span className="text-sm text-mud-400">#{r.Bib}</span>
        </div>
        <button
          onClick={onRemove}
          aria-label="Remove from tracked"
          className="text-mud-400 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="mb-3 text-xs uppercase tracking-wide text-mud-400">
        {r.Category} · Rank {r.Rank}
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Field label="Laps" value={r.laps} />
        <Field label="Miles" value={r.distanceMiles} />
        <Field label="Last lap" value={formatDuration(r.lastLapSec)} />
        <Field label="Avg lap" value={formatDuration(r.avgLapSec)} />
        <Field label="Last seen" value={`${r.LastSeen}`} />
        <Field label="At" value={r.LastSeenTOD} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-mud-700 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-mud-400">{label}</div>
      <div className="font-mono text-white">{value}</div>
    </div>
  );
}
