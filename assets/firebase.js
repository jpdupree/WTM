// Thin wrapper over Firebase Realtime Database. All shared broadcast
// state lives under /control. Pages stay usable when Firebase is not
// configured yet — `configured` is false and the helpers no-op.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, set, onValue, get,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

export const configured = Boolean(firebaseConfig.databaseURL);

let db = null;
if (configured) {
  db = getDatabase(initializeApp(firebaseConfig));
}

// Write a value under control/<path>.
export function writeControl(path, value) {
  if (!db) return Promise.reject(new Error("Firebase not configured"));
  return set(ref(db, "control/" + path), value);
}

// Subscribe to control/<path>; cb fires immediately and on every change.
export function watchControl(path, cb) {
  if (!db) return () => {};
  return onValue(ref(db, "control/" + path), (snap) => cb(snap.val()));
}

// One-off read of control/<path>.
export async function readControl(path) {
  if (!db) return null;
  return (await get(ref(db, "control/" + path))).val();
}
