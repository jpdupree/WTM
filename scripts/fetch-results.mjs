// Fetches the enriched RaceResult feed (the OCRReportall report for
// everyone) and writes data/results.json. The men/women slices are
// derived from it; the teams slice comes from its own team-level feed
// (RACE_FEED_TEAMS) so it carries team names and combined mileage. If a
// fetch fails, the previous file is left untouched so a transient API
// hiccup won't blank the dashboard.
//
// This is the scheduled-Action path. The race-day live path is
// scripts/results-poll.mjs, which shares build-slices.mjs with this.

import { readFile, writeFile } from "node:fs/promises";
import { fetchFeed, buildSlices } from "./build-slices.mjs";

const OUT = new URL("../data/results.json", import.meta.url);
const FEED_URL = process.env.RACE_FEED_OVERALL;
const TEAMS_URL = process.env.RACE_FEED_TEAMS;

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return { updatedAt: null, slices: {} };
  }
}

if (!FEED_URL) {
  console.error("RACE_FEED_OVERALL secret is not set.");
  process.exit(1);
}

let overall;
try {
  overall = await fetchFeed(FEED_URL);
  console.log(`fetched ${overall.length} rows`);
} catch (err) {
  console.error(`fetch failed: ${err.message} — keeping previous data.`);
  process.exit(0);
}

if (!overall.some((r) => r.AgeGroupCategory)) {
  console.warn("feed has no AgeGroupCategory — age-group features will be inert.");
}

// The team standings come from a separate team-level report. Without
// that feed (or if it fails) buildSlices derives teams from the overall
// feed, which only lists individual members.
let teamRows = null;
if (TEAMS_URL) {
  try {
    teamRows = await fetchFeed(TEAMS_URL);
    console.log(`fetched ${teamRows.length} team rows`);
  } catch (err) {
    console.warn(`team feed fetch failed: ${err.message} — deriving teams from the overall feed.`);
  }
} else {
  console.warn("RACE_FEED_TEAMS not set — deriving teams from the overall feed.");
}

const slices = buildSlices(overall, teamRows);

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
