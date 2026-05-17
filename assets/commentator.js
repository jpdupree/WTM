import { configured, writeControl } from "./firebase.js";
import { LAP_MILES } from "./course-data.js";
import { project, drawChart, chartLegend, secToHms, SERIES_COLORS } from "./predict.js";
import { createCourseMap } from "./coursemap.js";
import { VMIX_LINKS } from "./links.js";

const REFRESH_MS = 30_000;

let results = { slices: {} };
let soloBib = null;
const pred = { bibs: [], goalMiles: 50 };

const $ = (id) => document.getElementById(id);
const overall = () => (results.slices && results.slices.overall) || [];
const SLICE_KEYS = ["overall", "men", "women", "teams"];

function rowByBib(bib) {
  const s = results.slices || {};
  for (const key of SLICE_KEYS) {
    const hit = (s[key] || []).find((r) => String(r.Bib) === String(bib));
    if (hit) return hit;
  }
  return null;
}

// --- Firebase status banner -----------------------------------------
const banner = $("fb-banner");
if (configured) {
  banner.textContent = "Live — selections push to vMix via Firebase.";
  banner.className = "banner ok";
} else {
  banner.textContent =
    "Preview mode — Firebase not configured. Selections won't reach vMix " +
    "until assets/firebase-config.js is filled in (see README).";
  banner.className = "banner warn";
}

// --- vMix quick links -----------------------------------------------
const linkbar = $("vmix-links");
for (const def of [
  { key: "social", label: "Social Page" },
  { key: "telestrator", label: "Telestrator" },
]) {
  const url = VMIX_LINKS[def.key];
  const a = document.createElement("a");
  a.textContent = def.label;
  if (url) {
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "linkbtn";
  } else {
    a.className = "linkbtn disabled";
    a.title = "URL not set — edit assets/links.js";
  }
  linkbar.appendChild(a);
}

// --- shared result list ---------------------------------------------
function renderResultRows(rows, container, onPick, emptyMsg) {
  container.innerHTML = "";
  if (rows.length === 0) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = emptyMsg;
    container.appendChild(note);
    return;
  }
  for (const r of rows) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "result";
    b.textContent = `#${r.Bib}  ${r.Name}  —  ${r.Category || ""}`;
    b.addEventListener("click", () => onPick(r));
    container.appendChild(b);
  }
}

function renderSearch(query, container, onPick) {
  const q = query.trim().toLowerCase();
  if (!q) {
    container.innerHTML = "";
    return;
  }
  const matches = overall()
    .filter(
      (r) =>
        String(r.Bib).toLowerCase().startsWith(q) ||
        String(r.Name || "").toLowerCase().includes(q),
    )
    .slice(0, 12);
  renderResultRows(
    matches,
    container,
    onPick,
    overall().length ? "No match." : "No results loaded yet.",
  );
}

// Top 10 of a slice, ordered by RaceResult rank.
function topTen(sliceKey) {
  const rows = (results.slices && results.slices[sliceKey]) || [];
  return [...rows]
    .filter((r) => Number.isFinite(parseFloat(r.Rank)))
    .sort((a, b) => parseFloat(a.Rank) - parseFloat(b.Rank))
    .slice(0, 10);
}

// --- solo stats ------------------------------------------------------
const soloSearch = $("solo-search");
const soloResults = $("solo-results");
const soloLive = $("solo-live");

soloSearch.addEventListener("input", () =>
  renderSearch(soloSearch.value, soloResults, (r) => {
    soloBib = r.Bib;
    soloSearch.value = "";
    soloResults.innerHTML = "";
    pushSolo();
  }),
);

$("solo-clear").addEventListener("click", () => {
  soloBib = null;
  soloLive.textContent = "Nothing selected.";
  soloLive.className = "live-panel";
  if (configured) writeControl("athlete", null).catch(() => {});
});

function pushSolo() {
  if (soloBib == null) return;
  const r = rowByBib(soloBib);
  soloLive.className = "live-panel";
  if (!r) {
    soloLive.textContent = `Bib ${soloBib} is not in the current feed.`;
    return;
  }
  soloLive.innerHTML = "";
  const name = document.createElement("div");
  name.className = "live-name";
  name.textContent = `#${r.Bib}  ${r.Name}`;
  const detail = document.createElement("div");
  detail.className = "live-detail";
  detail.textContent =
    `Rank ${r.Rank} • ${r.Laps} laps • ${r.Distance} • ${r.TotalTime}`;
  soloLive.append(name, detail);

  if (configured) {
    writeControl("athlete", { ...r, _updatedAt: new Date().toISOString() }).catch(
      (err) => {
        soloLive.className = "live-panel error";
        soloLive.append(document.createTextNode(" — sync failed: " + err.message));
      },
    );
  }
}

// --- news ticker -----------------------------------------------------
const newsInput = $("news-input");
const newsLive = $("news-live");

function pushNews(items) {
  const text = items.join("    •    ");
  newsLive.textContent = text || "Ticker empty.";
  if (configured) {
    writeControl("news", {
      items,
      text,
      updatedAt: new Date().toISOString(),
    }).catch((err) => {
      newsLive.textContent = "Sync failed: " + err.message;
    });
  }
}

$("news-send").addEventListener("click", () => {
  const items = newsInput.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  pushNews(items);
});

$("news-clear").addEventListener("click", () => {
  newsInput.value = "";
  pushNews([]);
});

// --- prediction ------------------------------------------------------
const predSearch = $("pred-search");
const predResults = $("pred-results");
const predGoal = $("pred-goal");
const predReadout = $("pred-readout");
const predChart = $("pred-chart");
const predLegend = $("pred-legend");

let cmap = null;
try {
  cmap = createCourseMap("pred-map");
} catch (err) {
  console.error("Course map failed to load:", err);
}

predSearch.addEventListener("input", () =>
  renderSearch(predSearch.value, predResults, (r) => {
    pred.bibs = [String(r.Bib)];
    predSearch.value = "";
    predResults.innerHTML = "";
    pushPrediction();
  }),
);

// A Top 10 button loads all ten onto the chart and map at once.
document.querySelectorAll("[data-slice]").forEach((b) =>
  b.addEventListener("click", () => {
    pred.bibs = topTen(b.dataset.slice).map((r) => String(r.Bib));
    predSearch.value = "";
    predResults.innerHTML = "";
    pushPrediction();
  }),
);

$("pred-clear").addEventListener("click", () => {
  pred.bibs = [];
  predSearch.value = "";
  predResults.innerHTML = "";
  pushPrediction();
});

predGoal.addEventListener("input", () => {
  pred.goalMiles = parseFloat(predGoal.value) || 0;
  pushPrediction();
});

document.querySelectorAll("[data-goal]").forEach((b) =>
  b.addEventListener("click", () => {
    pred.goalMiles = parseFloat(b.dataset.goal);
    predGoal.value = pred.goalMiles;
    pushPrediction();
  }),
);

function predEntries() {
  const entries = [];
  pred.bibs.forEach((bib, i) => {
    const r = rowByBib(bib);
    if (r) {
      entries.push({
        p: project(r, pred.goalMiles, LAP_MILES),
        label: `#${r.Bib} ${r.Name}`,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        bib: String(r.Bib),
      });
    }
  });
  return entries;
}

function renderPrediction() {
  const entries = predEntries();
  drawChart(predChart, entries);
  predLegend.innerHTML = "";
  predLegend.appendChild(chartLegend(entries));
  if (cmap) {
    cmap.setAthletes(
      entries.map((e) => ({ mile: e.p.miles, label: e.bib, color: e.color })),
    );
  }

  predReadout.innerHTML = "";
  if (entries.length === 0) {
    predReadout.textContent = pred.bibs.length
      ? "Selected athletes are not in the current feed."
      : "Pick an athlete or a Top 10 group.";
    return;
  }
  for (const e of entries) {
    const line = document.createElement("div");
    line.className = "pred-line";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.background = e.color;
    line.appendChild(sw);
    line.appendChild(
      document.createTextNode(
        `${e.label} — ${e.p.miles.toFixed(1)} mi, ` +
          (e.p.reached ? "goal reached" : `ETA ${secToHms(e.p.etaSec)}`),
      ),
    );
    predReadout.appendChild(line);
  }
}

function pushPrediction() {
  renderPrediction();
  if (configured) {
    writeControl("prediction", {
      bibs: pred.bibs,
      goalMiles: pred.goalMiles,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
  }
}

// --- data loading ----------------------------------------------------
async function loadResults() {
  try {
    const res = await fetch("data/results.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    results = await res.json();
  } catch {
    return; // keep previous data on a transient failure
  }
  if (soloBib != null) pushSolo();
  renderPrediction();
}

window.addEventListener("resize", renderPrediction);

loadResults();
setInterval(loadResults, REFRESH_MS);
