// Build data/athlete-photos.json from a Drive folder of bib-named race photos.
//
// Files are expected to start with the athlete's bib number (e.g. `1136.jpg`
// or `1136 Joseph Rucco.jpg`); anything before the first non-digit is the bib.
// The output is { updatedAt, photos: { "<bib>": "<drive_file_id>" } } so the
// browser can build a thumbnail URL like
//   https://drive.google.com/thumbnail?id=<id>&sz=w400
// without needing Drive auth at runtime.
//
// One-time setup:
//   1. The folder must be shared "Anyone with the link → Viewer" so the
//      browser can fetch thumbnails without a login.
//   2. Same Google API key you set up for the vMix bridge works here — just
//      make sure the Drive API is enabled on its project.
//   3. Copy scripts/photos-config.example.json to scripts/photos-config.json
//      and fill in driveApiKey + folderId.
//
// Run it (Node 18+):
//   node scripts/build-athlete-photos.mjs
//
// Re-run any time photos are added or replaced; commit the resulting JSON.

import { readFileSync, writeFileSync } from "node:fs";

let cfg = {};
try {
  cfg = JSON.parse(
    readFileSync(new URL("./photos-config.json", import.meta.url), "utf8"),
  );
} catch {
  /* fall back to env */
}
const apiKey = process.env.WTM_DRIVE_API_KEY || cfg.driveApiKey;
const folderId = process.env.WTM_PHOTOS_FOLDER_ID || cfg.folderId;

if (!apiKey || !folderId) {
  console.error(
    "Missing driveApiKey or folderId. Copy scripts/photos-config.example.json " +
      "to scripts/photos-config.json and fill it in, or set WTM_DRIVE_API_KEY " +
      "and WTM_PHOTOS_FOLDER_ID env vars.",
  );
  process.exit(1);
}

const OUT = new URL("../data/athlete-photos.json", import.meta.url);

async function listAll() {
  const out = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "nextPageToken,files(id,name)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      key: apiKey,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Drive API HTTP ${res.status} — ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    out.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

const files = await listAll();
console.log(`Found ${files.length} image file(s) in the folder.`);

const manifest = {};
const skipped = [];
const collisions = [];
for (const f of files) {
  const m = f.name.match(/^(\d+)/);
  if (!m) {
    skipped.push(f.name);
    continue;
  }
  const bib = m[1];
  if (manifest[bib]) collisions.push(bib);
  manifest[bib] = f.id;
}

writeFileSync(
  OUT,
  JSON.stringify(
    { updatedAt: new Date().toISOString(), photos: manifest },
    null,
    2,
  ) + "\n",
);
console.log(
  `Wrote ${Object.keys(manifest).length} bib → photo entries to data/athlete-photos.json`,
);
if (skipped.length) {
  console.log(
    `  Skipped ${skipped.length} file(s) without a leading bib number:`,
    skipped.slice(0, 5).join(", "),
    skipped.length > 5 ? "…" : "",
  );
}
if (collisions.length) {
  console.log(
    `  ${collisions.length} bib collision(s) — later file wins:`,
    [...new Set(collisions)].slice(0, 5).join(", "),
  );
}
