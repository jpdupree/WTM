import type { RawResult, Result } from "./types";

export function parseDuration(s: string | undefined | null): number {
  if (!s) return 0;
  const parts = s.split(":").map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  let h = 0, m = 0, sec = 0;
  if (parts.length === 3) [h, m, sec] = parts;
  else if (parts.length === 2) [m, sec] = parts;
  else [sec] = parts;
  return h * 3600 + m * 60 + sec;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0 || !Number.isFinite(seconds)) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseDiffMiles(d: string | undefined): number | null {
  if (!d || d === "-") return null;
  // Diff comes as "-10" / "-15" — magnitude is miles behind leader.
  const n = Number(d.replace(/[−–-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function enrich(raw: RawResult): Result {
  const laps = Number(raw.Laps) || 0;
  const distanceMiles = Number(raw.Distance) || 0;
  const totalTimeSec = parseDuration(raw.TotalTime);
  const lastLapSec = parseDuration(raw.LastLapTime);
  const avgLapSec = laps > 0 ? Math.round(totalTimeSec / laps) : 0;
  return {
    ...raw,
    laps,
    distanceMiles,
    totalTimeSec,
    lastLapSec,
    avgLapSec,
    diffMiles: parseDiffMiles(raw.Diff),
  };
}

export function flagEmoji(iso3: string): string {
  // Best-effort ISO3 -> ISO2 for common WTM nations.
  const map: Record<string, string> = {
    USA: "US", GBR: "GB", CAN: "CA", IRL: "IE", AUS: "AU", NZL: "NZ",
    GER: "DE", DEU: "DE", FRA: "FR", ESP: "ES", ITA: "IT", NED: "NL",
    SWE: "SE", NOR: "NO", DEN: "DK", FIN: "FI", POL: "PL", BEL: "BE",
    AUT: "AT", CHE: "CH", SUI: "CH", POR: "PT", JPN: "JP", MEX: "MX",
    BRA: "BR", ARG: "AR", RSA: "ZA", ZAF: "ZA",
  };
  const code = map[iso3?.toUpperCase()];
  if (!code) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(...code.split("").map((c) => A + c.charCodeAt(0) - 65));
}
