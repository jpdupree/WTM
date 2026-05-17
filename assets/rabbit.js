import { watchRabbits } from "./firebase.js";
import { rabbitList } from "./rabbits.js";
import { createCourseMap } from "./coursemap.js";
import { SERIES_COLORS } from "./predict.js";
import { LAP_MILES } from "./course-data.js";

const $ = (id) => document.getElementById(id);

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

// Camera positions (from Larix Broadcaster) always show on the map.
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
