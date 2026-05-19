// Firebase Realtime Database wrapper. The SDK is loaded lazily via
// dynamic import so a CDN failure (or an unconfigured project) degrades
// to "no live sync" instead of blanking the page that imports this.

import { firebaseConfig } from "./firebase-config.js";

export const configured = Boolean(firebaseConfig.databaseURL);

const SDK = "https://www.gstatic.com/firebasejs/10.12.0";
let ready = null;

function load() {
  if (!configured) return Promise.resolve(null);
  if (!ready) {
    ready = (async () => {
      const appMod = await import(`${SDK}/firebase-app.js`);
      const dbMod = await import(`${SDK}/firebase-database.js`);
      const app = appMod.initializeApp(firebaseConfig);
      return {
        db: dbMod.getDatabase(app),
        ref: dbMod.ref,
        set: dbMod.set,
        onValue: dbMod.onValue,
        get: dbMod.get,
      };
    })().catch((err) => {
      console.error("Firebase failed to load:", err);
      return null;
    });
  }
  return ready;
}

export async function writeControl(path, value) {
  const f = await load();
  if (!f) return;
  return f.set(f.ref(f.db, "control/" + path), value);
}

export async function watchControl(path, cb) {
  const f = await load();
  if (!f) return;
  f.onValue(f.ref(f.db, "control/" + path), (snap) => cb(snap.val()));
}

export async function readControl(path) {
  const f = await load();
  if (!f) return null;
  return (await f.get(f.ref(f.db, "control/" + path))).val();
}

// --- live results feed ----------------------------------------------

// Subscribe to the live results snapshot written by the race-day poller
// (scripts/results-poll.mjs). The callback fires with the same
// { updatedAt, slices } shape as data/results.json, or null when the
// poller hasn't published yet. Returns false when Firebase is
// unavailable so the caller can fall back to the static results.json.
export async function watchResults(cb) {
  const f = await load();
  if (!f) return false;
  f.onValue(f.ref(f.db, "results"), (snap) => cb(snap.val()));
  return true;
}

// --- rabbit (camera-operator) GPS ------------------------------------

// Subscribe to all camera positions. Positions are written by the
// Larix Tuner poller (scripts/rabbit-poll.mjs).
export async function watchRabbits(cb) {
  const f = await load();
  if (!f) return;
  f.onValue(f.ref(f.db, "rabbits"), (snap) => cb(snap.val() || {}));
}

// --- social wall (curated Instagram posts) --------------------------

export async function watchSocial(cb) {
  const f = await load();
  if (!f) return;
  f.onValue(f.ref(f.db, "social"), (snap) => cb(snap.val() || {}));
}

export async function setSocialPost(id, value) {
  const f = await load();
  if (!f) return;
  return f.set(f.ref(f.db, "social/" + id), value);
}

export async function removeSocialPost(id) {
  const f = await load();
  if (!f) return;
  return f.set(f.ref(f.db, "social/" + id), null);
}
