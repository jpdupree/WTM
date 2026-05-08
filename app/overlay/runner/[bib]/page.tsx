"use client";
import { use, useMemo } from "react";
import { useResults } from "@/lib/useResults";
import { flagEmoji, formatDuration } from "@/lib/format";

export default function RunnerOverlay({
  params,
}: {
  params: Promise<{ bib: string }>;
}) {
  const { bib } = use(params);
  const target = Number(bib);
  const { data } = useResults("overall", 15_000);

  const r = useMemo(
    () => (data?.results ?? []).find((x) => x.Bib === target),
    [data, target]
  );

  if (!r) {
    return (
      <div className="inline-block rounded-xl bg-black/70 px-4 py-3 text-white">
        <div className="text-sm">Bib #{target} not found.</div>
      </div>
    );
  }

  return (
    <div className="inline-block min-w-[420px] rounded-xl bg-black/70 p-5 text-white shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center gap-3">
        <span className="text-3xl">{flagEmoji(r.Nation)}</span>
        <div>
          <div className="text-2xl font-bold leading-tight">{r.Name}</div>
          <div className="text-xs uppercase tracking-wide text-white/60">
            #{r.Bib} · {r.Category} · Rank {r.Rank}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Laps" value={r.laps} />
        <Stat label="Miles" value={r.distanceMiles} />
        <Stat label="Last lap" value={formatDuration(r.lastLapSec)} />
      </div>
      <div className="mt-2 text-center text-xs text-white/60">
        {r.LastSeen} · {r.LastSeenTOD}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-white/60">
        {label}
      </div>
      <div className="font-mono text-xl font-bold">{value}</div>
    </div>
  );
}
