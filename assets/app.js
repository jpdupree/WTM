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
  expanded: new Set(),
};

function num(v) {
  const n = parseFloat(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : Infinity;
}

// Per-lap duration fields, in order. Lap 21 is "Twentyfirstlap"
// (lower-case L) — that is the actual feed key.
const LAP_FIELDS = [
  "FirstLap", "SecondLap", "ThirdLap", "FourthLap", "FifthLap",
  "SixthLap", "SeventhLap", "EighthLap", "NinthLap", "TenthLap",
  "EleventhLap", "TwelfthLap", "ThirteenthLap", "FourteenthLap",
  "FifteenthLap", "SixteenthLap", "SeventeenthLap", "EighteenthLap",
  "NineteenthLap", "TwentiethLap", "Twentyfirstlap", "TwentysecondLap",
  "TwentythirdLap", "TwentyfourthLap", "TwentyfifthLap",
];

// Pit time for a given lap (0-based index) — the feed's Pit1..Pit25
// fields. "-" or "" mean no pit was recorded for that lap.
function pitOf(row, lapIndex) {
  const v = row["Pit" + (lapIndex + 1)];
  if (v == null || v === "" || v === "-") return null;
  return String(v);
}

// Lap-by-lap detail panel shown when an athlete row is expanded.
function lapDetail(row) {
  const wrap = document.createElement("div");
  wrap.className = "lap-detail";

  const laps = [];
  for (let i = 0; i < LAP_FIELDS.length; i++) {
    const t = row[LAP_FIELDS[i]];
    if (t == null || t === "") break;
    laps.push({ n: i + 1, time: String(t), pit: pitOf(row, i) });
  }
  if (laps.length === 0) {
    wrap.textContent = "No lap data for this athlete.";
    return wrap;
  }

  const grid = document.createElement("div");
  grid.className = "lap-grid";
  for (const label of ["Lap", "Lap Time", "Pit Time"]) {
    const h = document.createElement("div");
    h.className = "lap-head";
    h.textContent = label;
    grid.appendChild(h);
  }
  for (const lap of laps) {
    const cells = [String(lap.n), lap.time, lap.pit == null ? "—" : String(lap.pit)];
    cells.forEach((v, i) => {
      const d = document.createElement("div");
      if (i) d.className = "num";
      d.textContent = v;
      grid.appendChild(d);
    });
  }
  wrap.appendChild(grid);
  return wrap;
}

function addDetailRow(tr, row, colCount) {
  const detail = document.createElement("tr");
  detail.className = "detail-row";
  const td = document.createElement("td");
  td.colSpan = colCount;
  td.appendChild(lapDetail(row));
  detail.appendChild(td);
  tr.after(detail);
  tr.classList.add("open");
}

// Make an athlete row tap-to-expand its lap/pit breakdown. Expansion is
// tracked by bib in state.expanded so it survives the 30s re-render.
function makeExpandable(tr, row, colCount) {
  const bib = String(row.Bib);
  tr.classList.add("expandable");
  tr.addEventListener("click", () => {
    if (state.expanded.has(bib)) {
      state.expanded.delete(bib);
      const next = tr.nextElementSibling;
      if (next && next.classList.contains("detail-row")) next.remove();
      tr.classList.remove("open");
    } else {
      state.expanded.add(bib);
      addDetailRow(tr, row, colCount);
    }
  });
  if (state.expanded.has(bib)) addDetailRow(tr, row, colCount);
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
    makeExpandable(tr, row, cols.length);
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

// Default 18 male/female brackets — shown as placeholders before the
// feed carries age data. The live feed may add more (e.g. "Male 15-17").
const DEFAULT_AGE_GROUPS = [
  "Female 18-24", "Female 25-29", "Female 30-34", "Female 35-39",
  "Female 40-44", "Female 45-49", "Female 50-54", "Female 55-59",
  "Female 60+",
  "Male 18-24", "Male 25-29", "Male 30-34", "Male 35-39", "Male 40-44",
  "Male 45-49", "Male 50-54", "Male 55-59", "Male 60+",
];

// Age-group label for a row, from the feed's AgeGroupCategory field
// (e.g. "Male 50-54"), or null when the feed has no age data.
function ageGroupOf(row) {
  return String(row.AgeGroupCategory || "").trim() || null;
}

// Sort age-group labels: Female before Male, then ascending by age.
function ageOrder(label) {
  const m = String(label).match(/(\d+)/);
  return (String(label).startsWith("Female") ? 0 : 1000) + (m ? +m[1] : 999);
}
function sortGroups(list) {
  return [...list].sort((a, b) => ageOrder(a) - ageOrder(b));
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

function renderGroupSections(wrap, groups, buckets) {
  for (const gender of ["Female", "Male"]) {
    const inGender = groups.filter((g) => g.startsWith(gender));
    if (inGender.length === 0) continue;
    const section = document.createElement("div");
    section.className = "board";
    const h2 = document.createElement("h2");
    h2.textContent = gender + " — Age Groups";
    section.appendChild(h2);
    const grid = document.createElement("div");
    grid.className = "ag-grid";
    for (const g of inGender) {
      const rows = topN(buckets.get(g) || [], "AgeGroup").slice(0, 3);
      grid.appendChild(ageGroupCard(g, rows));
    }
    section.appendChild(grid);
    wrap.appendChild(section);
  }
}

function renderAgeGroups(slices) {
  const wrap = document.createElement("div");
  const note = document.createElement("p");
  note.className = "note";
  wrap.appendChild(note);

  const individuals = (slices.overall || []).filter((r) => r.Category !== "Team");
  const present = sortGroups([
    ...new Set(individuals.map(ageGroupOf).filter(Boolean)),
  ]);

  if (present.length === 0) {
    note.textContent =
      "Top 3 of each age group — the overall top-3 men and women are " +
      "excluded. Groups populate once the feed includes athlete age data.";
    renderGroupSections(wrap, DEFAULT_AGE_GROUPS, new Map());
    return wrap;
  }

  note.textContent =
    "Top 3 of each age group — the overall top-3 men and women are excluded.";
  const exclude = overallPodiumBibs(slices);
  const buckets = new Map(present.map((g) => [g, []]));
  for (const r of individuals) {
    if (exclude.has(String(r.Bib))) continue; // drop overall podium
    const g = ageGroupOf(r);
    if (g && buckets.has(g)) buckets.get(g).push(r);
  }
  renderGroupSections(wrap, present, buckets);
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

// Gender of an athlete, from the feed's Sex field ("m"/"f"), or null
// when the feed has no gender data.
function genderOf(row) {
  const s = String(row.Sex || "").trim().toLowerCase();
  if (s === "m" || s === "male") return "Male";
  if (s === "f" || s === "female") return "Female";
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
    makeExpandable(tr, row, OVERALL_COLS.length);
  }
  table.appendChild(tbody);
  return table;
}

function renderOverall(slices) {
  const wrap = document.createElement("div");
  const all = slices.overall || [];

  const hasAge = all.some((r) => ageGroupOf(r));
  const note = document.createElement("p");
  note.className = "note";
  note.textContent = hasAge
    ? "Every athlete. Click a column header to sort, or filter by gender and age group."
    : "Every athlete. Click a column header to sort. The gender and " +
      "age-group filters activate once the feed includes that data.";
  wrap.appendChild(note);

  const ageOptions = [
    "all",
    ...sortGroups([
      ...new Set([...DEFAULT_AGE_GROUPS, ...all.map(ageGroupOf).filter(Boolean)]),
    ]),
  ];
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
      makeSelect(ageOptions, state.fAgeGroup, (v) => {
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
