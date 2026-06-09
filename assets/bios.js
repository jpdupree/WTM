// Pre-event participant survey → solo-stats "From the athlete" block.
//
// Reads data/bios.csv (an export of the form responses) and matches each
// selected athlete by name. The CSV is served from the same site, so this
// just needs a fetch — no Drive auth.

let biosPromise = null;

export function loadBios() {
  if (!biosPromise) biosPromise = doLoad();
  return biosPromise;
}

async function doLoad() {
  try {
    const res = await fetch(new URL("../data/bios.csv", import.meta.url));
    if (!res.ok) return [];
    return parseBios(await res.text());
  } catch (err) {
    console.warn("bios load failed:", err);
    return [];
  }
}

// Find the bio for an athlete name. Exact (token-set) match first; falls
// back to subset matching so "Anne Clifford" finds "Anne Carolyn Clifford",
// then to first-name prefix so "Chris" matches "Christopher".
export function findBio(name, bios) {
  const qT = tokens(name);
  if (!qT.length) return null;
  const qKey = [...qT].sort().join(" ");
  for (const b of bios) if (b.key === qKey) return b;
  for (const b of bios) {
    const [s, l] = qT.length <= b.tokens.length ? [qT, b.tokens] : [b.tokens, qT];
    if (s.every((t) => l.includes(t))) return b;
  }
  for (const b of bios) {
    if (qT.length < 2 || b.tokens.length < 2) continue;
    const aRest = [...qT.slice(1)].sort().join(" ");
    const cRest = [...b.tokens.slice(1)].sort().join(" ");
    if (aRest !== cRest) continue;
    const a = qT[0];
    const c = b.tokens[0];
    if (a.startsWith(c) || c.startsWith(a)) return b;
  }
  return null;
}

export function renderBio(bio, container, opts = {}) {
  if (!opts.skipPhoto && bio.photoUrl) {
    const fileId = (bio.photoUrl.match(/(?:\/d\/|[?&]id=)([-\w]{10,})/) || [])[1];
    if (fileId) {
      const link = document.createElement("a");
      link.className = "bio-photo";
      link.href = bio.photoUrl;
      link.target = "_blank";
      link.rel = "noopener";
      const img = document.createElement("img");
      img.className = "bio-photo-img";
      img.alt = bio.name ? bio.name + " — race photo" : "Athlete photo";
      img.loading = "lazy";
      img.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
      img.onerror = () => { link.style.display = "none"; };
      link.appendChild(img);
      container.appendChild(link);
    }
  }
  const dl = document.createElement("dl");
  dl.className = "bio-fields";
  for (const { q, a } of bio.fields) {
    const dt = document.createElement("dt");
    dt.textContent = q;
    const dd = document.createElement("dd");
    dd.textContent = a;
    dl.append(dt, dd);
  }
  container.appendChild(dl);
}

// --- internals -------------------------------------------------------

function tokens(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[.,'"`]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Concise labels for the verbose form questions. null = drop the row.
const FIELD_LABELS = [
  ["timestamp", null],
  ["full name", null],
  ["if 'other' for country", null], // free-text "Other" merges into Country; skip stand-alone
  ["country of residence", "Country"],
  ["registration category", "Category"],
  ["previous tough mudder events", "Past TM Events"],
  ["previous world's toughest mudder events", "Past WTM Events"],
  ["previous mileage achievement", "Previous WTM Mileage"],
  ["confidence level", "2026 Goal Confidence"], // checked before "mileage goal" so the confidence question doesn't match the goal needle first
  ["mileage goal", "2026 Goal"],
  ["ocr/endurance race history", "OCR History"],
  ["last major obstacle course race", "Last Major Race"],
  ["race photo", null], // rendered as a separate link
  ["fun fact", "Fun Fact"],
  ["favourite tough mudder obstacle", "Favorite Obstacle"],
  ["favorite tough mudder obstacle", "Favorite Obstacle"],
  ["toughest tough mudder obstacle", "Toughest Obstacle"],
];

function shortLabel(q) {
  const k = String(q).toLowerCase();
  for (const [needle, label] of FIELD_LABELS) {
    if (k.includes(needle)) return label;
  }
  return q.trim();
}

function extractDriveLink(s) {
  const m = String(s || "").match(/https?:\/\/[^\s,]*drive\.google\.com[^\s,]*/);
  return m ? m[0] : null;
}

// RFC-4180-ish CSV parser (handles quoted fields with commas and newlines).
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseBios(text) {
  const rows = parseCSV(text).filter((r) => r.some((c) => c !== ""));
  if (rows.length < 2) return [];
  const header = rows[0];
  const nameCol = header.findIndex((h) => /full name/i.test(h));
  let photoCol = header.findIndex((h) => /race photo|head shot/i.test(h));
  if (photoCol < 0) {
    // fall back to the column whose cells actually hold Drive links
    const counts = {};
    for (const r of rows.slice(1))
      r.forEach((cell, i) => { if (extractDriveLink(cell)) counts[i] = (counts[i] || 0) + 1; });
    let best = -1, n = 0;
    for (const i of Object.keys(counts))
      if (counts[i] > n) { n = counts[i]; best = +i; }
    photoCol = best;
  }

  const bios = [];
  for (const row of rows.slice(1)) {
    const fullName = (nameCol >= 0 ? row[nameCol] : "").trim();
    if (!fullName) continue;
    const photoUrl = photoCol >= 0 ? extractDriveLink(row[photoCol]) : null;
    const fields = [];
    header.forEach((h, i) => {
      if (i === nameCol || i === photoCol) return;
      const label = shortLabel(h);
      if (label === null) return;
      const ans = (row[i] || "").trim();
      if (!ans) return;
      fields.push({ q: label, a: ans });
    });
    const toks = tokens(fullName);
    bios.push({
      name: fullName,
      tokens: toks,
      key: [...toks].sort().join(" "),
      fields,
      photoUrl,
    });
  }
  return bios;
}
