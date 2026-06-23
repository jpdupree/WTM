// RaceResult -> Firebase live results poller.
//
// Run this on the always-on vMix / AWS machine for the event. Every 20s
// it fetches the RaceResult feeds and writes the results snapshot to the
// dashboard's /results path, so the pages update within seconds of a
// timing-mat crossing instead of waiting on the 10-minute GitHub Action.
// The Action stays on as a fallback. Needs Node 18+.
//
// Setup: copy feed-config.example.json to feed-config.json and fill in
// the feed URLs (or set RACE_FEED_OVERALL / RACE_FEED_TEAMS), then:
//   node scripts/results-poll.mjs

import { readFileSync } from "node:fs";
import { fetchFeed, buildSlices } from "./build-slices.mjs";

const DB = "https://wtm-broadcast-default-rtdb.firebaseio.com";
const INTERVAL_MS = 20_000;

let overallUrl = process.env.RACE_FEED_OVERALL;
let teamUrl = process.env.RACE_FEED_TEAMS;
try {
  const c = JSON.parse(
    readFileSync(new URL("./feed-config.json", import.meta.url), "utf8"),
  );
  overallUrl = overallUrl || c.overallFeedUrl;
  teamUrl = teamUrl || c.teamFeedUrl;
} catch {
  /* fall back to env vars */
}
if (!overallUrl) {
  console.error(
    "Missing the overall feed URL. Copy feed-config.example.json to\n" +
      "scripts/feed-config.json and fill in overallFeedUrl (and teamFeedUrl).",
  );
  process.exit(1);
}

const stamp = () => new Date().toLocaleTimeString();
let lastPushed = null;

async function poll() {
  const overall = await fetchFeed(overallUrl);

  let teamRows = null;
  if (teamUrl) {
    try {
      teamRows = await fetchFeed(teamUrl);
    } catch (err) {
      console.warn(`  team feed failed: ${err.message} — deriving teams from overall.`);
    }
  }

  const slices = buildSlices(overall, teamRows);

  // Always touch updatedAt so the pages' 5-minute staleness gate doesn't
  // trip during long no-change stretches (e.g. pre-race empty feed). PATCH
  // only the updatedAt key when slices are unchanged so we don't churn the
  // whole snapshot; PUT the full snapshot when something actually moved.
  const slicesJson = JSON.stringify(slices);
  if (slicesJson === lastPushed) {
    const res = await fetch(`${DB}/results.json`, {
      method: "PATCH",
      body: JSON.stringify({ updatedAt: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`Firebase heartbeat HTTP ${res.status}`);
    console.log(`${stamp()} — no change (${overall.length} athletes)`);
    return;
  }

  const res = await fetch(`${DB}/results.json`, {
    method: "PUT",
    body: JSON.stringify({ updatedAt: new Date().toISOString(), slices }),
  });
  if (!res.ok) throw new Error(`Firebase write HTTP ${res.status}`);
  lastPushed = slicesJson;
  console.log(
    `${stamp()} — pushed ${overall.length} athletes, ${slices.teams.length} teams`,
  );
}

async function loop() {
  try {
    await poll();
  } catch (err) {
    console.error(`${stamp()} — poll failed: ${err.message}`);
  }
  setTimeout(loop, INTERVAL_MS);
}

console.log("WTM results poller started — polling RaceResult every 20s.");
loop();
