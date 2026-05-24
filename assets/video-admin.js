import {
  configured,
  watchVideoSubmissions,
  setVideoSubmission,
  watchControl,
  writeControl,
} from "./firebase.js";
import { VIDEO_SHEET_CSV_URL, VIDEO_POLL_SECONDS } from "./video-config.js";

const $ = (id) => document.getElementById(id);
const urlInput = $("url");
const statusEl = $("status");
const grid = $("grid");
const pollEl = $("poll-status");

const banner = $("fb-banner");
const autoPull = Boolean(VIDEO_SHEET_CSV_URL);
if (!configured) {
  banner.textContent =
    "Preview mode — Firebase not configured (see README). Nothing will sync.";
  banner.className = "banner warn";
} else if (autoPull) {
  banner.textContent = `Live — auto-pulling submissions every ${VIDEO_POLL_SECONDS}s. The clip you Show goes on air.`;
  banner.className = "banner ok";
} else {
  banner.textContent =
    "Live, but no response-sheet URL set — paste it in assets/video-config.js to auto-pull. You can still add clips by link below.";
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

function toISO(ts) {
  if (!ts) return null;
  const d = new Date(ts);
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
    submittedAt: new Date().toISOString(),
    source: "manual",
  });
  urlInput.value = "";
  setStatus("Added.", "ok");
});

// --- auto-pull from the published response sheet (CSV) ---------------

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

// Best-effort: figure out which columns hold the video, name, caption, time.
function mapColumns(header) {
  const idx = { video: -1, name: -1, caption: -1, timestamp: -1, email: -1 };
  header.forEach((h, i) => {
    const k = String(h).toLowerCase();
    if (idx.timestamp < 0 && k.includes("timestamp")) idx.timestamp = i;
    if (idx.email < 0 && k.includes("email")) idx.email = i;
    if (idx.name < 0 && k.includes("name")) idx.name = i;
    if (idx.caption < 0 &&
        (k.includes("caption") || k.includes("description") ||
         k.includes("title") || k.includes("about") ||
         k.includes("message") || k.includes("tell"))) idx.caption = i;
    if (idx.video < 0 &&
        (k.includes("upload") || k.includes("video") ||
         k.includes("file") || k.includes("clip"))) idx.video = i;
  });
  return idx;
}

async function pullSheet() {
  if (!autoPull || !configured) return;
  let text;
  try {
    const res = await fetch(VIDEO_SHEET_CSV_URL, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (err) {
    pollEl.textContent = `Couldn't read the sheet (${err.message}). Retrying…`;
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
  const col = mapColumns(header);
  let added = 0;
  for (const row of rows.slice(1)) {
    const cell = col.video >= 0 ? row[col.video] || "" : row.join(" ");
    const fileIds = extractFileIds(cell);
    if (!fileIds.length) continue;
    const name =
      (col.name >= 0 && row[col.name]) ||
      (col.email >= 0 && row[col.email]) ||
      "Anonymous";
    const caption = col.caption >= 0 ? row[col.caption] || "" : "";
    const submittedAt =
      toISO(col.timestamp >= 0 ? row[col.timestamp] : null) ||
      new Date().toISOString();
    for (const fileId of fileIds) {
      // Skip anything we already have so manual edits / hides aren't undone.
      if (submissions[fileId]) continue;
      setVideoSubmission(fileId, {
        id: fileId,
        fileId,
        name: String(name).trim(),
        caption: String(caption).trim(),
        submittedAt,
        source: "form",
      });
      added++;
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

function render() {
  grid.innerHTML = "";
  const list = Object.values(submissions)
    .filter((s) => s && !s.hidden && s.fileId)
    .sort((a, b) =>
      String(b.submittedAt).localeCompare(String(a.submittedAt)),
    );

  if (list.length === 0) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = autoPull
      ? "No submissions yet — they'll appear here as they come in."
      : "No clips added yet.";
    grid.appendChild(note);
    return;
  }

  for (const s of list) {
    const isActive = s.id === activeId;
    const card = document.createElement("div");
    card.className = "video-card" + (isActive ? " active" : "");

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
    meta.appendChild(who);
    if (s.caption) {
      const cap = document.createElement("div");
      cap.className = "caption";
      cap.textContent = s.caption;
      meta.appendChild(cap);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";

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

    actions.append(showBtn, x);
    card.append(frame, meta, actions);
    grid.appendChild(card);
  }
}

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
