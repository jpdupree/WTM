// Fetches the four RaceResult feeds and writes data/results.json.
// Feed URLs come from Actions secrets, so they never touch the repo.
// A slice that fails to fetch keeps its previous data so a transient
// API hiccup during the live event does not blank the dashboard.

import { readFile, writeFile } from "node:fs/promises";

const OUT = new URL("../data/results.json", import.meta.url);

const SLICES = [
  { key: "overall", env: "RACE_FEED_OVERALL" },
  { key: "men", env: "RACE_FEED_MEN" },
  { key: "women", env: "RACE_FEED_WOMEN" },
  { key: "teams", env: "RACE_FEED_TEAMS" },
];

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return { updatedAt: null, slices: {} };
  }
}

async function fetchSlice(url) {
  const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("expected a JSON array");
  return data;
}

const previous = await readPrevious();
const slices = { ...previous.slices };
let anySuccess = false;

for (const { key, env } of SLICES) {
  const url = process.env[env];
  if (!url) {
    console.warn(`skip ${key}: secret ${env} not set`);
    continue;
  }
  try {
    slices[key] = await fetchSlice(url);
    anySuccess = true;
    console.log(`ok ${key}: ${slices[key].length} rows`);
  } catch (err) {
    console.error(`fail ${key}: ${err.message} (keeping previous data)`);
  }
}

if (!anySuccess && !previous.updatedAt) {
  console.error("no feeds fetched and no previous data; writing empty file");
}

const out = { updatedAt: new Date().toISOString(), slices };
await writeFile(OUT, JSON.stringify(out) + "\n");
console.log(`wrote ${OUT.pathname}`);
