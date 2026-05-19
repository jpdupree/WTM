import { configured, writeControl, watchRabbits, watchResults } from "./firebase.js";
import { LAP_MILES } from "./course-data.js";
import { project, drawChart, chartLegend, markDim, secToHms, pitStats, pitFmt, SERIES_COLORS } from "./predict.js";
import { createCourseMap } from "./coursemap.js";
import { rabbitList } from "./rabbits.js";
import { VMIX_LINKS } from "./links.js";

const REFRESH_MS = 30_000;

let results = { slices: {} };
let soloBib = null;
const pred = { bibs: [], goalMiles: 50, focus: [] };

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
  soloLive.appendChild(name);

  const grid = document.createElement("div");
  grid.className = "stat-grid";
  const ps = pitStats(r);
  const stats = [
    ["Place", r.Rank],
    ["Nation", r.Nation],
    ["Laps", r.Laps],
    ["Distance", r.Distance],
    ["Last Lap", r.LastLapTime],
    ["Total Time", r.TotalTime],
    ["Total Pit", ps ? pitFmt(ps.totalSec) : "—"],
    ["Avg Pit", ps ? pitFmt(ps.avgSec) : "—"],
    ["Last Seen", r.LastSeen],
    ["Last Seen TOD", r.LastSeenTOD],
  ];
  for (const [label, value] of stats) {
    const cell = document.createElement("div");
    cell.className = "stat";
    const l = document.createElement("span");
    l.className = "stat-label";
    l.textContent = label;
    const v = document.createElement("span");
    v.className = "stat-value";
    v.textContent = value == null || value === "" ? "—" : String(value);
    cell.append(l, v);
    grid.appendChild(cell);
  }
  soloLive.appendChild(grid);

  if (configured) {
    // Written as a one-row array so vMix's JSON Data Source reads it
    // (vMix expects a list of rows, like the RaceResult feeds).
    writeControl("athlete", [{ ...r, _updatedAt: new Date().toISOString() }]).catch(
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
    // One-row array so vMix's JSON Data Source can read the `text` field.
    writeControl("news", [{ text, updatedAt: new Date().toISOString() }]).catch(
      (err) => {
        newsLive.textContent = "Sync failed: " + err.message;
      },
    );
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

// Camera (rabbit) positions on the prediction map — local toggle.
const rabbitsBtn = $("pred-rabbits");
let showRabbits = false;
let rabbits = [];

function drawRabbits() {
  if (cmap) cmap.setRabbits(showRabbits ? rabbits : []);
  rabbitsBtn.classList.toggle("on", showRabbits);
  const count = rabbits.length ? ` (${rabbits.length})` : "";
  rabbitsBtn.textContent =
    (showRabbits ? "Hide camera positions" : "Show camera positions") + count;
}

rabbitsBtn.addEventListener("click", () => {
  showRabbits = !showRabbits;
  drawRabbits();
});

watchRabbits((obj) => {
  rabbits = rabbitList(obj);
  drawRabbits();
});

drawRabbits();

// Replace the selection (and reset any focus) with a new set of bibs.
function setSelection(bibs) {
  pred.bibs = bibs;
  pred.focus = [];
  predSearch.value = "";
  predResults.innerHTML = "";
  pushPrediction();
}

predSearch.addEventListener("input", () =>
  renderSearch(predSearch.value, predResults, (r) => addToSelection(String(r.Bib))),
);

// Searching and clicking a person adds them to the current list.
function addToSelection(bib) {
  const b = String(bib);
  if (!pred.bibs.includes(b)) pred.bibs.push(b);
  predSearch.value = "";
  predResults.innerHTML = "";
  pushPrediction();
}

// Remove one athlete (the X on their row) from the list and any focus.
function removeFromSelection(bib) {
  const b = String(bib);
  pred.bibs = pred.bibs.filter((x) => x !== b);
  pred.focus = pred.focus.filter((x) => x !== b);
  pushPrediction();
}

// A Top 10 button loads all ten onto the chart and map at once.
document.querySelectorAll("[data-slice]").forEach((b) =>
  b.addEventListener("click", () =>
    setSelection(topTen(b.dataset.slice).map((r) => String(r.Bib))),
  ),
);

$("pred-clear").addEventListener("click", () => setSelection([]));

// Tap an athlete in the readout to focus them — others dim on the chart
// and map. Tapping again releases; several can be focused at once.
function toggleFocus(bib) {
  const b = String(bib);
  const i = pred.focus.indexOf(b);
  if (i >= 0) pred.focus.splice(i, 1);
  else pred.focus.push(b);
  pushPrediction();
}

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
  markDim(entries, pred.focus);
  drawChart(predChart, entries);
  predLegend.innerHTML = "";
  predLegend.appendChild(chartLegend(entries));
  if (cmap) {
    cmap.setAthletes(
      entries.map((e) => ({
        mile: e.p.miles, label: e.bib, color: e.color, dim: e.dim,
      })),
    );
  }

  predReadout.innerHTML = "";
  if (entries.length === 0) {
    predReadout.textContent = pred.bibs.length
      ? "Selected athletes are not in the current feed."
      : "Pick an athlete or a Top 10 group.";
    return;
  }
  const focusActive = pred.focus.length > 0;
  for (const e of entries) {
    const line = document.createElement("div");
    line.className =
      "pred-line" + (e.dim ? " dimmed" : focusActive ? " focused" : "");

    const main = document.createElement("div");
    main.className = "pred-line-main";
    main.title = "Tap to focus";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.background = e.color;
    main.appendChild(sw);
    main.appendChild(
      document.createTextNode(
        `${e.label} — ${e.p.miles.toFixed(1)} mi, ` +
          (e.p.reached ? "goal reached" : `ETA ${secToHms(e.p.etaSec)}`),
      ),
    );
    main.addEventListener("click", () => toggleFocus(e.bib));

    const x = document.createElement("button");
    x.type = "button";
    x.className = "pred-x";
    x.textContent = "×";
    x.title = "Remove";
    x.addEventListener("click", () => removeFromSelection(e.bib));

    line.append(main, x);
    predReadout.appendChild(line);
  }
}

function pushPrediction() {
  renderPrediction();
  if (configured) {
    writeControl("prediction", {
      bibs: pred.bibs,
      goalMiles: pred.goalMiles,
      focus: pred.focus,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
  }
}

// --- data loading ----------------------------------------------------
function applyResults(data) {
  if (!data || !data.slices) return;
  results = data;
  if (soloBib != null) pushSolo();
  renderPrediction();
}

// Once the live poller's results arrive over Firebase, stop polling the
// static file — Firebase pushes every change on its own.
let liveResults = false;

async function loadResults() {
  if (liveResults) return;
  try {
    const res = await fetch("data/results.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    applyResults(await res.json());
  } catch {
    /* keep previous data on a transient failure */
  }
}

window.addEventListener("resize", renderPrediction);

loadResults();
setInterval(loadResults, REFRESH_MS);

// Live results from the race-day poller take over the moment they land.
watchResults((data) => {
  if (data && data.slices) {
    liveResults = true;
    applyResults(data);
  }
});
