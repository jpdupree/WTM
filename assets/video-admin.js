import {
  configured,
  watchVideoSubmissions,
  setVideoSubmission,
  watchControl,
  writeControl,
} from "./firebase.js";
import {
  VIDEO_SHEET,
  VIDEO_SHEET_CSV_URL,
  VIDEO_POLL_SECONDS,
} from "./video-config.js";

const $ = (id) => document.getElementById(id);
const urlInput = $("url");
const statusEl = $("status");
const grid = $("grid");
const pollEl = $("poll-status");
const fStatus = $("f-status");
const fType = $("f-type");
const fOrient = $("f-orient");
const fSearch = $("f-search");
const countEl = $("count");

// Work out the URL the browser fetches the rows from. A published-CSV URL
// (if set) wins; otherwise build the gviz CSV endpoint from the shared
// sheet's id — that needs only "Anyone with the link → Viewer".
function sheetCsvUrl() {
  if (VIDEO_SHEET_CSV_URL) return VIDEO_SHEET_CSV_URL;
  if (!VIDEO_SHEET) return "";
  const id = (String(VIDEO_SHEET).match(/[-\w]{30,}/) || [])[0];
  if (!id) return "";
  const gid = (String(VIDEO_SHEET).match(/[#?&]gid=(\d+)/) || [])[1];
  let url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1`;
  if (gid) url += `&gid=${gid}`;
  return url;
}
const CSV_URL = sheetCsvUrl();

const banner = $("fb-banner");
const autoPull = Boolean(CSV_URL);
if (!configured) {
  banner.textContent =
    "Preview mode — Firebase not configured (see README). Nothing will sync.";
  banner.className = "banner warn";
} else if (autoPull) {
  banner.textContent = `Live — auto-pulling submissions every ${VIDEO_POLL_SECONDS}s. The clip you Show goes on air.`;
  banner.className = "banner ok";
} else {
  banner.textContent =
    "Live, but no response sheet set — add it in assets/video-config.js to auto-pull. You can still add clips by link below.";
  banner.className = "banner warn";
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "msg" + (kind ? " " + kind : "");
}

// Pull a Drive file id out of a share link, an `open?id=` URL, or a bare id.
function extractFileId(text) {
  const m = String(text).match(/(?:\/d\/|[?&]id=)([-\w]{20,})/);
  if (m) return m[1];
  const bare = String(text).trim();
  return /^[-\w]{20,}$/.test(bare) ? bare : null;
}

// All Drive file ids found in a string (a single upload cell can hold several).
function extractFileIds(text) {
  const ids = [];
  const re = /(?:\/d\/|[?&]id=)([-\w]{20,})/g;
  let m;
  while ((m = re.exec(text))) ids.push(m[1]);
  return ids;
}

// Accept either a plain date string or gviz's Date(y,m,d,h,m,s) form.
function toISO(ts) {
  if (!ts) return null;
  const s = String(ts).trim();
  const g = s.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
  const d = g
    ? new Date(+g[1], +g[2], +g[3], +(g[4] || 0), +(g[5] || 0), +(g[6] || 0))
    : new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// --- manual add (paste a Drive link) --------------------------------

$("add").addEventListener("click", () => {
  const fileId = extractFileId(urlInput.value);
  if (!fileId) {
    setStatus("That doesn't look like a Google Drive video link or file id.", "error");
    return;
  }
  setVideoSubmission(fileId, {
    id: fileId,
    fileId,
    name: "Added by crew",
    caption: "",
    portrait: false,
    submittedAt: new Date().toISOString(),
    source: "manual",
  });
  urlInput.value = "";
  setStatus("Added.", "ok");
});

// --- auto-pull from the response sheet (CSV) ------------------------

// Minimal RFC-4180 CSV parser (handles quoted fields, commas, newlines).
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// First header column matching any keyword, tried in priority order.
function findCol(header, keywords) {
  for (const kw of keywords) {
    const i = header.findIndex((h) => String(h).toLowerCase().includes(kw));
    if (i >= 0) return i;
  }
  return -1;
}

// The upload column is the one whose cells actually hold Drive links — far
// more reliable than matching a header (the form has other "video" columns).
function detectVideoCol(dataRows) {
  const counts = {};
  for (const row of dataRows) {
    row.forEach((cell, i) => {
      if (extractFileIds(cell).length) counts[i] = (counts[i] || 0) + 1;
    });
  }
  let best = -1;
  let bestN = 0;
  for (const i of Object.keys(counts)) {
    if (counts[i] > bestN) { bestN = counts[i]; best = +i; }
  }
  return best;
}

async function pullSheet() {
  if (!autoPull || !configured) return;
  let text;
  try {
    const res = await fetch(CSV_URL, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (err) {
    pollEl.textContent = `Couldn't read the sheet (${err.message}). Check sharing, or set a Publish-to-web CSV URL in video-config.js. Retrying…`;
    pollEl.className = "poll-status warn";
    return;
  }

  const rows = parseCSV(text).filter((r) => r.some((c) => c !== ""));
  if (rows.length < 2) {
    pollEl.textContent = "Sheet reachable — no submissions yet.";
    pollEl.className = "poll-status";
    return;
  }

  const header = rows[0];
  const data = rows.slice(1);
  const col = {
    name: findCol(header, ["team name", "name"]),
    email: findCol(header, ["email"]),
    caption: findCol(header, ["description", "caption", "brief", "comment", "about"]),
    timestamp: findCol(header, ["timestamp", "date"]),
    orientation: findCol(header, ["landscape or portrait", "orientation", "portrait"]),
    type: findCol(header, ["what type", "type of video", "type"]),
    video: detectVideoCol(data),
  };
  if (col.video < 0) col.video = findCol(header, ["upload", "video file", "attach", "clip"]);

  let added = 0;
  for (const row of data) {
    const cell = col.video >= 0 ? row[col.video] || "" : row.join(" ");
    const fileIds = extractFileIds(cell);
    if (!fileIds.length) continue;
    const name =
      (col.name >= 0 && row[col.name]) ||
      (col.email >= 0 && row[col.email]) ||
      "Anonymous";
    const caption = col.caption >= 0 ? row[col.caption] || "" : "";
    const portrait =
      col.orientation >= 0 && /portrait|vertical/i.test(row[col.orientation] || "");
    const submittedAt =
      toISO(col.timestamp >= 0 ? row[col.timestamp] : null) ||
      new Date().toISOString();
    const type = col.type >= 0 ? String(row[col.type] || "").trim() : "";
    // Every other answered question, in form order, for the curator card.
    // Skip the upload, name (it's the heading) and timestamp (shown separately).
    const fields = [];
    header.forEach((h, i) => {
      if (i === col.video || i === col.name || i === col.timestamp) return;
      const a = (row[i] || "").trim();
      if (a) fields.push({ q: String(h).trim(), a });
    });
    for (const fileId of fileIds) {
      const existing = submissions[fileId];
      const record = {
        id: fileId,
        fileId,
        name: String(name).trim(),
        caption: String(caption).trim(),
        portrait,
        type,
        submittedAt,
        fields,
        source: "form",
      };
      if (!existing) {
        setVideoSubmission(fileId, record);
        added++;
      } else if (existing.source !== "manual" && (!existing.fields || !("type" in existing))) {
        // Migrate rows imported before these fields existed, keeping the
        // crew's hidden / viewed flags.
        setVideoSubmission(fileId, { ...existing, ...record });
      }
      // Otherwise leave it alone — don't undo manual edits or flags.
    }
  }
  const stamp = new Date().toLocaleTimeString();
  pollEl.textContent = added
    ? `Pulled ${added} new submission${added === 1 ? "" : "s"} at ${stamp}.`
    : `Up to date — last checked ${stamp}.`;
  pollEl.className = "poll-status ok";
}

// --- render ----------------------------------------------------------

let submissions = {};
let activeId = null;
let polling = false;
let typeOptionsKey = "";

// Keep the Type dropdown in sync with the types present, without clobbering
// the crew's current selection on every poll.
function syncTypeOptions(all) {
  const types = [...new Set(all.map((s) => (s.type || "").trim()).filter(Boolean))].sort();
  const key = types.join("|");
  if (key === typeOptionsKey) return;
  typeOptionsKey = key;
  const cur = fType.value || "all";
  fType.innerHTML = "";
  fType.appendChild(new Option("All types", "all"));
  for (const t of types) {
    fType.appendChild(new Option(t.length > 44 ? t.slice(0, 44) + "…" : t, t));
  }
  fType.value = cur === "all" || types.includes(cur) ? cur : "all";
}

function matchesFilters(s) {
  const st = fStatus.value;
  if (st === "unviewed" && s.viewed) return false;
  if (st === "viewed" && !s.viewed) return false;
  if (fType.value !== "all" && (s.type || "") !== fType.value) return false;
  const o = fOrient.value;
  if (o === "portrait" && !s.portrait) return false;
  if (o === "landscape" && s.portrait) return false;
  const q = fSearch.value.trim().toLowerCase();
  if (q) {
    const hay = [s.name, s.caption, ...(s.fields || []).map((f) => f.a)]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function render() {
  grid.innerHTML = "";
  const all = Object.values(submissions)
    .filter((s) => s && !s.hidden && s.fileId)
    .sort((a, b) =>
      String(b.submittedAt).localeCompare(String(a.submittedAt)),
    );

  syncTypeOptions(all);
  const list = all.filter(matchesFilters);
  const unviewed = all.filter((s) => !s.viewed).length;
  countEl.textContent = all.length
    ? `${list.length} of ${all.length} shown · ${unviewed} unviewed`
    : "";

  if (all.length === 0) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = autoPull
      ? "No submissions yet — they'll appear here as they come in."
      : "No clips added yet.";
    grid.appendChild(note);
    return;
  }
  if (list.length === 0) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = "No submissions match the filters.";
    grid.appendChild(note);
    return;
  }

  for (const s of list) {
    const isActive = s.id === activeId;
    const card = document.createElement("div");
    card.className =
      "video-card" + (isActive ? " active" : "") + (s.viewed ? " viewed" : "");

    const frame = document.createElement("iframe");
    frame.className = "preview";
    frame.src = `https://drive.google.com/file/d/${s.fileId}/preview`;
    frame.allow = "encrypted-media";
    frame.loading = "lazy";

    const meta = document.createElement("div");
    meta.className = "meta";
    const who = document.createElement("div");
    who.className = "who";
    who.textContent = s.name || "Anonymous";
    if (s.portrait) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Portrait";
      who.appendChild(tag);
    }
    meta.appendChild(who);

    if (s.submittedAt) {
      const d = new Date(s.submittedAt);
      if (!isNaN(d.getTime())) {
        const when = document.createElement("div");
        when.className = "when";
        when.textContent = "Submitted " + d.toLocaleString();
        meta.appendChild(when);
      }
    }

    if (s.fields && s.fields.length) {
      const dl = document.createElement("dl");
      dl.className = "fields";
      for (const f of s.fields) {
        const dt = document.createElement("dt");
        dt.textContent = f.q;
        const dd = document.createElement("dd");
        dd.textContent = f.a;
        dl.append(dt, dd);
      }
      meta.appendChild(dl);
    } else if (s.caption) {
      const cap = document.createElement("div");
      cap.className = "caption";
      cap.textContent = s.caption;
      meta.appendChild(cap);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const viewed = document.createElement("label");
    viewed.className = "viewed-toggle";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = Boolean(s.viewed);
    cb.addEventListener("change", () =>
      setVideoSubmission(s.id, { ...s, viewed: cb.checked }),
    );
    viewed.append(cb, document.createTextNode("Viewed"));

    const showBtn = document.createElement("button");
    showBtn.type = "button";
    showBtn.className = "show-btn" + (isActive ? " on" : "");
    showBtn.textContent = isActive ? "● On air — take off" : "Show on air";
    showBtn.addEventListener("click", () => {
      if (isActive) writeControl("videoSubmission", null);
      else
        writeControl("videoSubmission", {
          id: s.id,
          fileId: s.fileId,
          name: s.name || "",
          caption: s.caption || "",
          portrait: Boolean(s.portrait),
        });
    });

    const x = document.createElement("button");
    x.type = "button";
    x.className = "x-btn";
    x.textContent = "×";
    x.title = "Hide from wall";
    x.addEventListener("click", () => {
      setVideoSubmission(s.id, { ...s, hidden: true });
      if (s.id === activeId) writeControl("videoSubmission", null);
    });

    actions.append(viewed, showBtn, x);
    card.append(frame, meta, actions);
    grid.appendChild(card);
  }
}

for (const el of [fStatus, fType, fOrient]) el.addEventListener("change", render);
fSearch.addEventListener("input", render);

$("clear").addEventListener("click", () =>
  writeControl("videoSubmission", null),
);

watchVideoSubmissions((obj) => {
  submissions = obj || {};
  render();
  // Start polling only once we know what's already stored, so the first
  // pull doesn't re-write (and un-hide) existing rows.
  if (!polling && autoPull && configured) {
    polling = true;
    pullSheet();
    setInterval(pullSheet, VIDEO_POLL_SECONDS * 1000);
  }
});

watchControl("videoSubmission", (val) => {
  activeId = val && val.id ? val.id : null;
  render();
});
