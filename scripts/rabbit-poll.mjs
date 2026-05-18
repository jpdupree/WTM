// Larix Tuner -> Firebase GPS poller.
//
// Run this on an always-on machine whose public IP is whitelisted in
// Larix Tuner (your machine for testing, the vMix machine for the
// event). It polls the Tuner API once a minute and writes each camera's
// position to the dashboard's /rabbits path. Needs Node 18+.
//
// Setup: copy larix-credentials.example.json to larix-credentials.json
//        and fill in your Tuner clientId and apiKey, then:
//   node scripts/rabbit-poll.mjs

import { readFileSync } from "node:fs";

const TUNER = "https://api.larixtuner.com/api/v1/public";
const DB = "https://wtm-broadcast-default-rtdb.firebaseio.com";
const INTERVAL_MS = 60_000;

let clientId = process.env.LARIX_CLIENT_ID;
let apiKey = process.env.LARIX_API_KEY;
try {
  const c = JSON.parse(
    readFileSync(new URL("./larix-credentials.json", import.meta.url), "utf8"),
  );
  clientId = clientId || c.clientId;
  apiKey = apiKey || c.apiKey;
} catch {
  /* fall back to env vars */
}
if (!clientId || !apiKey) {
  console.error(
    "Missing Larix Tuner credentials. Copy larix-credentials.example.json\n" +
      "to scripts/larix-credentials.json and fill in clientId and apiKey.",
  );
  process.exit(1);
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function poll() {
  const auth = `client_id=${clientId}&api_key=${apiKey}`;
  const list = await getJson(`${TUNER}/devices?${auth}`);
  const devices = list.devices || [];
  console.log(`${new Date().toLocaleTimeString()} — ${devices.length} device(s) in Tuner`);
  let live = 0;

  for (const d of devices) {
    const tag = d.description || d.device_id || d.id;
    const node = `${DB}/rabbits/${d.id}.json`;

    // Not sharing location, or offline — drop it from the maps.
    if (!d.geo_granted || d.sync_status === "offline") {
      await fetch(node, { method: "DELETE" });
      console.log(
        `  - ${tag}: skipped (sync=${d.sync_status}, ` +
          `geo_granted=${d.geo_granted}, remote_control=${d.remote_control}, ` +
          `last_sync=${d.last_sync})`,
      );
      continue;
    }

    try {
      const loc = await getJson(`${TUNER}/remote_control/${d.id}/location?${auth}`);
      const p = loc && loc.location;
      if (
        loc.status === "ok" &&
        p &&
        typeof p.lat === "number" &&
        typeof p.lng === "number"
      ) {
        await fetch(node, {
          method: "PUT",
          body: JSON.stringify({
            name: d.description || d.device_id || "Camera",
            lat: p.lat,
            lng: p.lng,
            at: new Date().toISOString(),
          }),
        });
        console.log(`  + ${tag}: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
        live++;
      } else {
        console.log(`  - ${tag}: no location (status=${loc.status})`);
      }
    } catch (err) {
      console.warn(`  - ${tag}: location error — ${err.message}`);
    }
  }
  console.log(`  -> ${live} camera(s) on the map`);
}

async function loop() {
  try {
    await poll();
  } catch (err) {
    console.error(`${new Date().toLocaleTimeString()} — poll failed: ${err.message}`);
  }
  setTimeout(loop, INTERVAL_MS);
}

console.log("WTM rabbit poller started — polling Larix Tuner every 60s.");
loop();
