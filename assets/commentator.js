import { configured, writeControl } from "./firebase.js";
import { LAP_MILES } from "./course-data.js";
import { project, drawChart, secToHms } from "./predict.js";
import { VMIX_LINKS } from "./links.js";

const REFRESH_MS = 30_000;

let results = { slices: {} };
let soloBib = null;
const pred = { bib: null, goalMiles: 50 };

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

function fieldLine(label, value) {
  const div = document.createElement("div");
  const span = document.createElement("span");
  span.className = "muted";
  span.textContent = label + " ";
  div.appendChild(span);
  div.appendChild(document.createTextNode(value));
  return div;
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

function pickPrediction(r) {
  pred.bib = r.Bib;
  predSearch.value = `#${r.Bib} ${r.Name}`;
  predResults.innerHTML = "";
  pushPrediction();
}

predSearch.addEventListener("input", () =>
  renderSearch(predSearch.value, predResults, pickPrediction),
);

document.querySelectorAll("[data-slice]").forEach((b) =>
  b.addEventListener("click", () => {
    const slice = b.dataset.slice;
    renderResultRows(
      topTen(slice),
      predResults,
      pickPrediction,
      `No ${slice} results loaded yet.`,
    );
  }),
);

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

function renderPrediction() {
  if (pred.bib == null) return;
  const r = rowByBib(pred.bib);
  if (!r) {
    predReadout.textContent = `Bib ${pred.bib} is not in the current feed.`;
    return;
  }
  const p = project(r, pred.goalMiles, LAP_MILES);
  predReadout.innerHTML = "";
  predReadout.append(
    fieldLine("Athlete", `#${r.Bib} ${r.Name}`),
    fieldLine("Now", `${p.miles.toFixed(1)} mi • lap ${p.laps} • ${secToHms(p.elapsedSec)}`),
    fieldLine("Pace", p.pace ? `${secToHms(p.pace)} / mile` : "—"),
    fieldLine(
      p.reached ? "Goal" : `Projected ${pred.goalMiles} mi`,
      p.reached ? "already reached" : secToHms(p.etaSec),
    ),
  );
  drawChart(predChart, p);
}

function pushPrediction() {
  renderPrediction();
  if (configured && pred.bib != null) {
    writeControl("prediction", {
      bib: pred.bib,
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
  if (pred.bib != null) renderPrediction();
}

window.addEventListener("resize", renderPrediction);

loadResults();
setInterval(loadResults, REFRESH_MS);
