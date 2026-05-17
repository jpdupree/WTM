// Polls the Larix Tuner API once a minute for camera-operator GPS and
// mirrors each device's position into /rabbits, so the dashboard maps
// show the cameras live. Camera names come from each device's Tuner
// "description" field.
//
// Deploy:   firebase deploy --only functions   (project must be on Blaze)
// Secrets:  firebase functions:secrets:set LARIX_CLIENT_ID
//           firebase functions:secrets:set LARIX_API_KEY

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

initializeApp();

const CLIENT_ID = defineSecret("LARIX_CLIENT_ID");
const API_KEY = defineSecret("LARIX_API_KEY");

const API = "https://api.larixtuner.com/api/v1/public";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

exports.rabbitPoll = onSchedule(
  {
    schedule: "every 1 minutes",
    secrets: [CLIENT_ID, API_KEY],
    timeoutSeconds: 60,
  },
  async () => {
    const auth = `client_id=${CLIENT_ID.value()}&api_key=${API_KEY.value()}`;
    const db = getDatabase();

    const list = await getJson(`${API}/devices?${auth}`);
    const devices = list.devices || [];
    let live = 0;

    for (const d of devices) {
      const ref = db.ref("rabbits/" + d.id);

      // Not sharing location, or offline — drop it from the maps.
      if (!d.geo_granted || d.sync_status === "offline") {
        await ref.remove();
        continue;
      }

      try {
        const loc = await getJson(
          `${API}/remote_control/${d.id}/location?${auth}`,
        );
        const p = loc && loc.location;
        if (
          loc.status === "ok" &&
          p &&
          typeof p.lat === "number" &&
          typeof p.lng === "number"
        ) {
          await ref.set({
            name: d.description || d.device_id || "Camera",
            lat: p.lat,
            lng: p.lng,
            at: new Date().toISOString(),
          });
          live++;
        }
      } catch (err) {
        // Transient miss — leave the last position; staleness handles it.
        console.warn(`location ${d.id}: ${err.message}`);
      }
    }
    console.log(`rabbitPoll: ${live}/${devices.length} cameras updated`);
  },
);
