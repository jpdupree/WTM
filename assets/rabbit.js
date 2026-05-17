import { configured, publishRabbit, clearRabbit } from "./firebase.js";
import { RABBIT_SLOTS } from "./rabbits.js";

const $ = (id) => document.getElementById(id);
const slotSel = $("slot");
const startBtn = $("start");
const stopBtn = $("stop");
const statusEl = $("status");

RABBIT_SLOTS.forEach((name, i) => {
  const o = document.createElement("option");
  o.value = String(i);
  o.textContent = name;
  slotSel.appendChild(o);
});

const saved = localStorage.getItem("wtm-rabbit-slot");
if (saved != null && RABBIT_SLOTS[saved] != null) slotSel.value = saved;

if (!configured) {
  statusEl.className = "status-box error";
  statusEl.textContent = "Firebase isn't configured — GPS sharing is unavailable.";
  startBtn.disabled = true;
}

let watchId = null;
let activeSlot = null;

function setSharing(on) {
  startBtn.hidden = on;
  stopBtn.hidden = !on;
  slotSel.disabled = on;
}

startBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    statusEl.className = "status-box error";
    statusEl.textContent = "This device has no location support.";
    return;
  }
  activeSlot = slotSel.value;
  localStorage.setItem("wtm-rabbit-slot", activeSlot);
  const name = RABBIT_SLOTS[activeSlot];

  statusEl.className = "status-box";
  statusEl.textContent = "Requesting location permission…";

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      publishRabbit(activeSlot, {
        name,
        lat: latitude,
        lng: longitude,
        acc: Math.round(accuracy),
        at: new Date().toISOString(),
      });
      statusEl.className = "status-box ok";
      statusEl.textContent =
        `Sharing as ${name} — last fix ${new Date().toLocaleTimeString()} — ` +
        `±${Math.round(accuracy)} m`;
    },
    (err) => {
      statusEl.className = "status-box error";
      statusEl.textContent = "Location error: " + err.message;
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
  );
  setSharing(true);
});

stopBtn.addEventListener("click", () => {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  if (activeSlot != null) clearRabbit(activeSlot);
  statusEl.className = "status-box";
  statusEl.textContent = "Stopped sharing.";
  setSharing(false);
});
