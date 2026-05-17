import { configured, publishRabbit, clearRabbit, watchRabbits } from "./firebase.js";
import { RABBIT_SLOTS, rabbitList } from "./rabbits.js";
import { createCourseMap } from "./coursemap.js";
import { SERIES_COLORS } from "./predict.js";
import { LAP_MILES } from "./course-data.js";

const $ = (id) => document.getElementById(id);

// --- GPS sharing -----------------------------------------------------
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

// Keeps the screen awake while sharing so a dedicated tracker phone on
// this page doesn't sleep. It does NOT keep GPS running when you switch
// to another app — that is a browser limitation.
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch {
    /* wake lock unavailable — ignore */
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// The lock is dropped when the page is hidden; re-acquire on return.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && watchId != null) requestWakeLock();
});

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
  requestWakeLock();
});

stopBtn.addEventListener("click", () => {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  releaseWakeLock();
  if (activeSlot != null) clearRabbit(activeSlot);
  statusEl.className = "status-box";
  statusEl.textContent = "Stopped sharing.";
  setSharing(false);
});

// --- course map + athletes ------------------------------------------
let results = { slices: {} };
let selected = [];

let cmap = null;
try {
  cmap = createCourseMap("rabbit-map");
} catch (err) {
  console.error("Course map failed to load:", err);
}

const athSearch = $("ath-search");
const athResults = $("ath-results");
const athList = $("ath-list");

const overall = () => (results.slices && results.slices.overall) || [];

function rowByBib(bib) {
  const s = results.slices || {};
  for (const k of ["overall", "men", "women", "teams"]) {
    const hit = (s[k] || []).find((r) => String(r.Bib) === String(bib));
    if (hit) return hit;
  }
  return null;
}

function topTen(slice) {
  const rows = (results.slices && results.slices[slice]) || [];
  return [...rows]
    .filter((r) => Number.isFinite(parseFloat(r.Rank)))
    .sort((a, b) => parseFloat(a.Rank) - parseFloat(b.Rank))
    .slice(0, 10);
}

function athleteEntries() {
  const entries = [];
  selected.forEach((bib, i) => {
    const r = rowByBib(bib);
    if (!r) return;
    const miles = parseFloat(r.Distance) || (parseInt(r.Laps, 10) || 0) * LAP_MILES;
    entries.push({
      mile: miles,
      label: String(r.Bib),
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      name: r.Name || "",
      bib: String(r.Bib),
    });
  });
  return entries;
}

function renderAthletes() {
  const entries = athleteEntries();
  if (cmap) cmap.setAthletes(entries);

  athList.innerHTML = "";
  for (const e of entries) {
    const row = document.createElement("div");
    row.className = "ath-row";
    const main = document.createElement("span");
    main.className = "ath-main";
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = e.color;
    main.append(sw, document.createTextNode(`#${e.bib} ${e.name}`));
    const x = document.createElement("button");
    x.type = "button";
    x.className = "x-btn";
    x.textContent = "×";
    x.title = "Remove";
    x.addEventListener("click", () => {
      selected = selected.filter((b) => b !== e.bib);
      renderAthletes();
    });
    row.append(main, x);
    athList.appendChild(row);
  }
}

function addAthlete(bib) {
  if (!selected.includes(bib)) selected.push(bib);
  athSearch.value = "";
  athResults.innerHTML = "";
  renderAthletes();
}

athSearch.addEventListener("input", () => {
  const q = athSearch.value.trim().toLowerCase();
  athResults.innerHTML = "";
  if (!q) return;
  const matches = overall()
    .filter(
      (r) =>
        String(r.Bib).toLowerCase().startsWith(q) ||
        String(r.Name || "").toLowerCase().includes(q),
    )
    .slice(0, 12);
  for (const r of matches) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "result";
    b.textContent = `#${r.Bib}  ${r.Name}`;
    b.addEventListener("click", () => addAthlete(String(r.Bib)));
    athResults.appendChild(b);
  }
});

document.querySelectorAll("[data-slice]").forEach((b) =>
  b.addEventListener("click", () => {
    selected = topTen(b.dataset.slice).map((r) => String(r.Bib));
    athSearch.value = "";
    athResults.innerHTML = "";
    renderAthletes();
  }),
);

$("ath-clear").addEventListener("click", () => {
  selected = [];
  athSearch.value = "";
  athResults.innerHTML = "";
  renderAthletes();
});

// Camera positions always show on the rabbit map.
watchRabbits((obj) => {
  if (cmap) cmap.setRabbits(rabbitList(obj));
});

async function loadResults() {
  try {
    const res = await fetch("data/results.json?t=" + Date.now(), { cache: "no-store" });
    if (res.ok) results = await res.json();
  } catch {
    return;
  }
  renderAthletes();
}

loadResults();
setInterval(loadResults, 30_000);
