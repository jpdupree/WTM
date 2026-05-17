// Fetches the enriched RaceResult feed (the OCRReportall report for
// everyone) and writes data/results.json. The men/women/teams slices
// are derived from it. If the fetch fails, the previous file is left
// untouched so a transient API hiccup won't blank the dashboard.

import { readFile, writeFile } from "node:fs/promises";

const OUT = new URL("../data/results.json", import.meta.url);
const FEED_URL = process.env.RACE_FEED_OVERALL;

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return { updatedAt: null, slices: {} };
  }
}

async function fetchFeed(url) {
  const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("expected a JSON array");
  return data;
}

const byRank = (a, b) => (parseFloat(a.Rank) || 1e9) - (parseFloat(b.Rank) || 1e9);

// A gender/category subset, re-ranked 1..N (overall rank kept as Overall).
function subset(rows, predicate) {
  return rows
    .filter(predicate)
    .sort(byRank)
    .map((r, i) => ({ ...r, Overall: r.Rank, Rank: i + 1 }));
}

if (!FEED_URL) {
  console.error("RACE_FEED_OVERALL secret is not set.");
  process.exit(1);
}

let overall;
try {
  overall = (await fetchFeed(FEED_URL)).sort(byRank);
  console.log(`fetched ${overall.length} rows`);
} catch (err) {
  console.error(`fetch failed: ${err.message} — keeping previous data.`);
  process.exit(0);
}

if (!overall.some((r) => r.AgeGroupCategory)) {
  console.warn("feed has no AgeGroupCategory — age-group features will be inert.");
}

const sex = (r) => String(r.Sex).toLowerCase();
const slices = {
  overall,
  men: subset(overall, (r) => r.Category === "Individual" && sex(r) === "m"),
  women: subset(overall, (r) => r.Category === "Individual" && sex(r) === "f"),
  teams: subset(overall, (r) => r.Category === "Team"),
};

// Skip the write when nothing changed, so an unchanging feed (e.g. an
// archived event) doesn't churn out a commit every run.
const previous = await readPrevious();
if (JSON.stringify(previous.slices) === JSON.stringify(slices)) {
  console.log("no change since last fetch — leaving results.json as is.");
  process.exit(0);
}

await writeFile(
  OUT,
  JSON.stringify({ updatedAt: new Date().toISOString(), slices }) + "\n",
);
console.log(`wrote ${OUT.pathname}`);
