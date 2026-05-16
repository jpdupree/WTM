"use strict";

// Tabs: each "slice" key maps to one of the four committed feeds.
// "agegroups" is derived from the overall feed by the Category field.
const TABS = [
  { id: "overall", label: "Overall" },
  { id: "men", label: "Men" },
  { id: "women", label: "Women" },
  { id: "teams", label: "Teams" },
  { id: "agegroups", label: "Age Groups" },
];

const TOP_N = 10;
const REFRESH_MS = 30_000;

let state = { data: null, active: "overall" };

function num(v) {
  const n = parseFloat(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : Infinity;
}

function topN(rows, rankField) {
  return [...(rows || [])]
    .filter((r) => Number.isFinite(num(r[rankField])))
    .sort((a, b) => num(a[rankField]) - num(b[rankField]))
    .slice(0, TOP_N);
}

// Build a table without innerHTML so feed values can never inject markup.
function buildTable(rows) {
  const cols = [
    { key: "Rank", label: "#", cls: "rank" },
    { key: "Bib", label: "Bib", cls: "num hide-sm" },
    { key: "Name", label: "Name", cls: "name" },
    { key: "Nation", label: "Nat", cls: "muted hide-sm" },
    { key: "Laps", label: "Laps", cls: "num" },
    { key: "Distance", label: "Miles", cls: "num" },
    { key: "TotalTime", label: "Total", cls: "num" },
    { key: "LastLapTime", label: "Last Lap", cls: "num hide-sm" },
    { key: "LastSeen", label: "Last Seen", cls: "muted hide-sm" },
  ];

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  for (const c of cols) {
    const th = document.createElement("th");
    th.textContent = c.label;
    if (c.cls.includes("hide-sm")) th.className = "hide-sm";
    htr.appendChild(th);
  }
  thead.appendChild(htr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    if (i < 3) tr.className = "r" + (i + 1);
    for (const c of cols) {
      const td = document.createElement("td");
      td.className = c.cls;
      const val = row[c.key];
      td.textContent = val === undefined || val === null || val === "" ? "—" : String(val);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function boardEl(title, rows, rankField) {
  const div = document.createElement("div");
  div.className = "board";
  const h2 = document.createElement("h2");
  h2.textContent = title;
  div.appendChild(h2);
  if (!rows || rows.length === 0) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No data yet.";
    div.appendChild(p);
  } else {
    div.appendChild(buildTable(topN(rows, rankField)));
  }
  return div;
}

function renderAgeGroups(overall) {
  const wrap = document.createElement("div");
  if (!overall || overall.length === 0) {
    wrap.innerHTML = '<p class="empty">No data yet.</p>';
    return wrap;
  }
  const groups = new Map();
  for (const r of overall) {
    const cat = r.Category || "Uncategorized";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(r);
  }
  const grid = document.createElement("div");
  grid.className = "grid";
  // AgeGroup holds the within-category rank; fall back to overall Rank.
  for (const cat of [...groups.keys()].sort()) {
    const rows = groups.get(cat);
    const field = rows.some((r) => Number.isFinite(num(r.AgeGroup))) ? "AgeGroup" : "Rank";
    grid.appendChild(boardEl(cat, rows, field));
  }
  wrap.appendChild(grid);
  return wrap;
}

function render() {
  const content = document.getElementById("content");
  content.innerHTML = "";
  const slices = (state.data && state.data.slices) || {};

  if (state.active === "agegroups") {
    content.appendChild(renderAgeGroups(slices.overall));
  } else {
    const labels = {
      overall: "Overall — Top 10",
      men: "Men — Top 10",
      women: "Women — Top 10",
      teams: "Teams — Top 10",
    };
    content.appendChild(boardEl(labels[state.active], slices[state.active], "Rank"));
  }
}

function renderTabs() {
  const nav = document.getElementById("tabs");
  nav.innerHTML = "";
  for (const t of TABS) {
    const b = document.createElement("button");
    b.className = "tab" + (t.id === state.active ? " active" : "");
    b.textContent = t.label;
    b.addEventListener("click", () => {
      state.active = t.id;
      renderTabs();
      render();
    });
    nav.appendChild(b);
  }
}

function setUpdated(text, isError) {
  const el = document.getElementById("updated");
  el.textContent = text;
  el.className = isError ? "error" : "";
}

async function load() {
  try {
    const res = await fetch("data/results.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    state.data = await res.json();
    render();
    if (state.data.updatedAt) {
      const d = new Date(state.data.updatedAt);
      setUpdated("Updated " + d.toLocaleString());
    } else {
      setUpdated("No results published yet — waiting on first feed fetch.");
    }
  } catch (err) {
    setUpdated("Failed to load results: " + err.message, true);
  }
}

document.getElementById("refresh").addEventListener("click", load);
renderTabs();
render();
load();
setInterval(load, REFRESH_MS);
