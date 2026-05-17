"use strict";

// Tabs: each "slice" key maps to one of the four committed feeds.
// "agegroups" splits the overall feed into 18 male/female age groups.
const TABS = [
  { id: "overall", label: "Overall" },
  { id: "men", label: "Men" },
  { id: "women", label: "Women" },
  { id: "teams", label: "Teams" },
  { id: "agegroups", label: "Age Groups" },
];

const TOP_N = 10;
const REFRESH_MS = 30_000;

let state = {
  data: null,
  active: "overall",
  sort: { key: "Rank", dir: 1 },
  fGender: "all",
  fAgeGroup: "all",
};

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

// The nine WTM age brackets, split by gender into 18 groups.
const AGE_BRACKETS = [
  "18-24", "25-29", "30-34", "35-39", "40-44",
  "45-49", "50-54", "55-59", "60+",
];
const AGE_GROUPS = [
  ...AGE_BRACKETS.map((b) => "Female " + b),
  ...AGE_BRACKETS.map((b) => "Male " + b),
];

// Map a feed row to one of the 18 age-group labels, or null if unknown.
// The current results feed carries NO age data — Category is only
// "Individual" / "Team" — so this returns null for everyone. Once the
// 2026 feed includes gender + age group, normalize that field here and
// match it to an AGE_GROUPS label; the rest of the tab then populates.
function ageGroupOf(row) {
  const raw = String(row.Category || "").trim().toLowerCase();
  for (const g of AGE_GROUPS) {
    if (raw === g.toLowerCase()) return g;
  }
  return null;
}

// Bibs of the overall top-3 men and top-3 women — excluded from the
// age-group standings (they get the overall awards instead).
function overallPodiumBibs(slices) {
  const bibs = new Set();
  for (const key of ["men", "women"]) {
    topN(slices[key] || [], "Rank")
      .slice(0, 3)
      .forEach((r) => bibs.add(String(r.Bib)));
  }
  return bibs;
}

function miniTable(rows) {
  const table = document.createElement("table");
  table.className = "mini";
  const tbody = document.createElement("tbody");
  rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.className = "r" + (i + 1);
    const cells = [
      { v: i + 1, cls: "rank" },
      { v: row.Name, cls: "name" },
      { v: row.Laps, cls: "num" },
      { v: (row.Distance ?? "") + " mi", cls: "num" },
    ];
    for (const c of cells) {
      const td = document.createElement("td");
      td.className = c.cls;
      td.textContent = c.v == null || c.v === "" || c.v === " mi" ? "—" : String(c.v);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function ageGroupCard(name, rows) {
  const card = document.createElement("div");
  card.className = "ag-card";
  const h3 = document.createElement("h3");
  h3.textContent = name;
  card.appendChild(h3);
  if (rows.length === 0) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Awaiting age data";
    card.appendChild(p);
  } else {
    card.appendChild(miniTable(rows));
  }
  return card;
}

function renderAgeGroups(slices) {
  const wrap = document.createElement("div");

  const note = document.createElement("p");
  note.className = "note";
  note.textContent =
    "Top 3 of each age group — the overall top-3 men and women are " +
    "excluded. Groups populate once the feed includes athlete age data.";
  wrap.appendChild(note);

  const exclude = overallPodiumBibs(slices);
  const buckets = new Map(AGE_GROUPS.map((g) => [g, []]));
  for (const r of slices.overall || []) {
    if (r.Category === "Team") continue; // individuals only
    if (exclude.has(String(r.Bib))) continue; // drop overall podium
    const g = ageGroupOf(r);
    if (g) buckets.get(g).push(r);
  }

  for (const gender of ["Female", "Male"]) {
    const section = document.createElement("div");
    section.className = "board";
    const h2 = document.createElement("h2");
    h2.textContent = gender + " — Age Groups";
    section.appendChild(h2);
    const grid = document.createElement("div");
    grid.className = "ag-grid";
    for (const g of AGE_GROUPS.filter((x) => x.startsWith(gender))) {
      grid.appendChild(ageGroupCard(g, topN(buckets.get(g), "Rank").slice(0, 3)));
    }
    section.appendChild(grid);
    wrap.appendChild(section);
  }
  return wrap;
}

// --- Overall tab: full sortable, filterable table --------------------

const OVERALL_COLS = [
  { key: "Rank", label: "#", cls: "rank", type: "num" },
  { key: "Bib", label: "Bib", cls: "num hide-sm", type: "num" },
  { key: "Name", label: "Name", cls: "name", type: "text" },
  { key: "Nation", label: "Nat", cls: "muted hide-sm", type: "text" },
  { key: "Category", label: "Type", cls: "muted hide-sm", type: "text" },
  { key: "Laps", label: "Laps", cls: "num", type: "num" },
  { key: "Distance", label: "Miles", cls: "num", type: "num" },
  { key: "TotalTime", label: "Total", cls: "num", type: "time" },
  { key: "LastLapTime", label: "Last Lap", cls: "num hide-sm", type: "time" },
  { key: "LastSeen", label: "Last Seen", cls: "muted hide-sm", type: "text" },
];

function hmsSec(s) {
  const p = String(s ?? "").split(":").map((x) => parseInt(x, 10));
  if (p.length < 2 || p.some((n) => Number.isNaN(n))) return Infinity;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  return p[0] * 60 + p[1];
}

function sortValue(row, col) {
  if (col.type === "num") return num(row[col.key]);
  if (col.type === "time") return hmsSec(row[col.key]);
  return String(row[col.key] ?? "").toLowerCase();
}

// Gender of an athlete. The current feed has no gender letter (its
// "Gender" field is a rank number), so this returns null until the
// 2026 feed provides it — same wiring point as ageGroupOf().
function genderOf(row) {
  const raw = String(row.Gender || "").trim().toLowerCase();
  if (raw === "m" || raw === "male") return "Male";
  if (raw === "f" || raw === "female") return "Female";
  return null;
}

function makeSelect(options, current, onChange) {
  const sel = document.createElement("select");
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = o === "all" ? "All" : o;
    if (o === current) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

function labelled(text, el) {
  const field = document.createElement("label");
  field.className = "field";
  const span = document.createElement("span");
  span.textContent = text;
  field.append(span, el);
  return field;
}

function buildSortableTable(rows) {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  for (const c of OVERALL_COLS) {
    const th = document.createElement("th");
    th.className = "sortable" + (c.cls.includes("hide-sm") ? " hide-sm" : "");
    th.textContent = c.label;
    if (state.sort.key === c.key) {
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = state.sort.dir > 0 ? " ▲" : " ▼";
      th.appendChild(arrow);
    }
    th.addEventListener("click", () => {
      if (state.sort.key === c.key) state.sort.dir *= -1;
      else state.sort = { key: c.key, dir: 1 };
      render();
    });
    htr.appendChild(th);
  }
  thead.appendChild(htr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const c of OVERALL_COLS) {
      const td = document.createElement("td");
      td.className = c.cls;
      const v = row[c.key];
      td.textContent = v == null || v === "" ? "—" : String(v);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function renderOverall(slices) {
  const wrap = document.createElement("div");
  const all = slices.overall || [];

  const note = document.createElement("p");
  note.className = "note";
  note.textContent =
    "Every athlete. Click a column header to sort. The gender and " +
    "age-group filters activate once the feed includes that data.";
  wrap.appendChild(note);

  const controls = document.createElement("div");
  controls.className = "controls";
  controls.append(
    labelled(
      "Gender",
      makeSelect(["all", "Male", "Female"], state.fGender, (v) => {
        state.fGender = v;
        render();
      }),
    ),
    labelled(
      "Age group",
      makeSelect(["all", ...AGE_GROUPS], state.fAgeGroup, (v) => {
        state.fAgeGroup = v;
        render();
      }),
    ),
  );
  wrap.appendChild(controls);

  let rows = all;
  if (state.fGender !== "all") rows = rows.filter((r) => genderOf(r) === state.fGender);
  if (state.fAgeGroup !== "all") rows = rows.filter((r) => ageGroupOf(r) === state.fAgeGroup);

  const col = OVERALL_COLS.find((c) => c.key === state.sort.key) || OVERALL_COLS[0];
  rows = [...rows].sort((a, b) => {
    const va = sortValue(a, col);
    const vb = sortValue(b, col);
    if (va < vb) return -state.sort.dir;
    if (va > vb) return state.sort.dir;
    return 0;
  });

  const count = document.createElement("p");
  count.className = "count";
  count.textContent = `${rows.length} of ${all.length} athletes`;
  wrap.appendChild(count);

  if (rows.length === 0) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = all.length
      ? "No athletes match the filter (gender/age data not in the feed yet)."
      : "No results loaded yet.";
    wrap.appendChild(p);
  } else {
    wrap.appendChild(buildSortableTable(rows));
  }
  return wrap;
}

function render() {
  const content = document.getElementById("content");
  content.innerHTML = "";
  const slices = (state.data && state.data.slices) || {};

  if (state.active === "agegroups") {
    content.appendChild(renderAgeGroups(slices));
  } else if (state.active === "overall") {
    content.appendChild(renderOverall(slices));
  } else {
    const labels = {
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
