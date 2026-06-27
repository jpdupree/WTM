import { watchRabbits, watchResults } from "./firebase.js";
import { rabbitList } from "./rabbits.js";
import { createCourseMap } from "./coursemap.js";
import { SERIES_COLORS, project, secondsSinceSeen, mapMile } from "./predict.js";
// Private 2026 course — same source the commentator dashboard uses.
import * as course2026 from "./course-data-2026.js";
const { LAP_MILES } = course2026;

const $ = (id) => document.getElementById(id);

let results = { slices: {} };
let selected = [];

let cmap = null;
try {
  cmap = createCourseMap("rabbit-map", course2026);
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
    // Project past the last mat crossing so the dot tracks where the
    // athlete actually is now, not where they last clocked a lap.
    const p = project(r, 100, LAP_MILES);
    entries.push({
      mile: mapMile(p, secondsSinceSeen(r), LAP_MILES),
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

// Re-place athlete dots every few seconds so they glide along the loop
// between feed updates (map only — leaves the athlete list DOM alone).
setInterval(() => {
  if (cmap && selected.length) cmap.setAthletes(athleteEntries());
}, 5000);

// Camera positions (from Larix Broadcaster) always show on the map.
watchRabbits((obj) => {
  if (cmap) cmap.setRabbits(rabbitList(obj));
});

// Once the live poller's results arrive over Firebase, stop polling the
// static file — Firebase pushes every change on its own.
let liveResults = false;

async function loadResults() {
  if (liveResults) return;
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

// Live results from the race-day poller take over the moment they land.
watchResults((data) => {
  if (data && data.slices) {
    liveResults = true;
    results = data;
    renderAthletes();
  }
});
