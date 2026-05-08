"use client";
import Link from "next/link";
import { useMemo } from "react";
import ResultsTable from "@/components/ResultsTable";
import StatTile from "@/components/StatTile";
import { useResults } from "@/lib/useResults";

function teamBibs(): Set<number> {
  const raw = process.env.NEXT_PUBLIC_TEAM_BIBS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
}

export default function Dashboard() {
  const { data, error, isLoading } = useResults(30_000);
  const highlight = useMemo(() => teamBibs(), []);

  const stats = useMemo(() => {
    const r = data?.results ?? [];
    const leader = r.find((x) => x.Rank === Math.min(...r.map((y) => y.Rank)));
    const totalRunners = r.length;
    const totalLaps = r.reduce((s, x) => s + x.laps, 0);
    const totalMiles = r.reduce((s, x) => s + x.distanceMiles, 0);
    return { leader, totalRunners, totalLaps, totalMiles };
  }, [data]);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">
            World&rsquo;s Toughest Mudder
          </h1>
          <p className="text-mud-400">
            Live race dashboard
            {data && (
              <span className="ml-2 text-mud-500">
                · updated {new Date(data.fetchedAt).toLocaleTimeString()} ·{" "}
                <span
                  className={
                    data.source === "live" ? "text-mud-ok" : "text-mud-accent"
                  }
                >
                  {data.source}
                </span>
              </span>
            )}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/team"
            className="rounded-md border border-mud-600 bg-mud-800 px-3 py-2 hover:bg-mud-700"
          >
            Team view
          </Link>
          <Link
            href="/overlay/leaderboard"
            className="rounded-md border border-mud-600 bg-mud-800 px-3 py-2 hover:bg-mud-700"
          >
            Overlay: Leaderboard
          </Link>
          <Link
            href="/overlay/team"
            className="rounded-md border border-mud-600 bg-mud-800 px-3 py-2 hover:bg-mud-700"
          >
            Overlay: Team
          </Link>
        </nav>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-mud-danger/50 bg-mud-danger/10 px-3 py-2 text-sm text-mud-danger">
          Failed to load results.
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Runners" value={stats.totalRunners} />
        <StatTile label="Total laps" value={stats.totalLaps} />
        <StatTile label="Total miles" value={stats.totalMiles} />
        <StatTile
          label="Leader"
          value={stats.leader ? stats.leader.Name : "—"}
          sub={stats.leader ? `${stats.leader.laps} laps · ${stats.leader.distanceMiles} mi` : undefined}
          accent
        />
      </section>

      {isLoading && !data ? (
        <div className="rounded-md border border-mud-600 bg-mud-800 p-8 text-center text-mud-400">
          Loading race results…
        </div>
      ) : (
        <ResultsTable results={data?.results ?? []} highlightBibs={highlight} />
      )}
    </main>
  );
}
