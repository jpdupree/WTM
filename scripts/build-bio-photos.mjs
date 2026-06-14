// Build data/bio-photos.json from a local folder of survey-uploaded photos.
//
// Drop survey photos into data/bio-photos/ — Google Forms downloads them as
// `<original> - <Full Name>.<ext>`, so the athlete name lives after the last
// " - " in the filename. We then resolve each photo to a bio in data/bios.csv
// using the same exact → subset → first-name-prefix tiers bios.js uses for
// findBio (plus accent folding so "jérôme" matches "jerome"), and write the
// manifest keyed by the bio's native token-set key so runtime lookup stays a
// plain `photos[bio.key]`.
//
// Run it after refreshing the folder OR after refreshing bios.csv:
//   node scripts/build-bio-photos.mjs
// Commit both data/bio-photos.json and any new photo files.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, "../data/bio-photos");
const OUT = resolve(__dirname, "../data/bio-photos.json");
const BIOS_CSV = resolve(__dirname, "../data/bios.csv");

const IMG = /\.(jpe?g|png|webp|gif|heic)$/i;

// Native tokenization matches bios.js — accents and parens preserved, so the
// resulting `key` is the same string bios.js's `b.key` produces at runtime.
function tokens(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[.,'"`]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Accent-folded, paren-stripped tokens used only for matching photos to bios:
// "jérôme lastapis" → "jerome lastapis"; "Samantha Gascoigne (Sam)" exposes
// "sam" as its own token so the subset rule reaches "Sam Gascoigne".
function normTokens(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,'"`()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Survey downloads: "<original filename> - <Athlete Name>.<ext>".
function nameFromFilename(fname) {
  const stem = fname.replace(IMG, "");
  const i = stem.lastIndexOf(" - ");
  return (i >= 0 ? stem.slice(i + 3) : stem).trim();
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
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

function loadBios() {
  const rows = parseCSV(readFileSync(BIOS_CSV, "utf8")).filter((r) =>
    r.some((c) => c !== ""),
  );
  const header = rows[0];
  const nameCol = header.findIndex((h) => /full name/i.test(h));
  const bios = [];
  for (const r of rows.slice(1)) {
    const name = (r[nameCol] || "").trim();
    if (!name) continue;
    const toks = tokens(name);
    bios.push({
      name,
      tokens: toks,
      key: [...toks].sort().join(" "),
      normTokens: normTokens(name),
    });
  }
  return bios;
}

function findBio(name, bios) {
  const qT = normTokens(name);
  if (!qT.length) return null;
  const qKey = [...qT].sort().join(" ");
  for (const b of bios) {
    if ([...b.normTokens].sort().join(" ") === qKey) return b;
  }
  for (const b of bios) {
    const [s, l] = qT.length <= b.normTokens.length ? [qT, b.normTokens] : [b.normTokens, qT];
    if (s.every((t) => l.includes(t))) return b;
  }
  for (const b of bios) {
    if (qT.length < 2 || b.normTokens.length < 2) continue;
    const aRest = [...qT.slice(1)].sort().join(" ");
    const cRest = [...b.normTokens.slice(1)].sort().join(" ");
    if (aRest !== cRest) continue;
    const a = qT[0], c = b.normTokens[0];
    if (a.startsWith(c) || c.startsWith(a)) return b;
  }
  return null;
}

let entries;
try {
  entries = readdirSync(DIR);
} catch (err) {
  if (err.code === "ENOENT") {
    console.error(
      `data/bio-photos/ doesn't exist yet. Drop survey photos into that folder and re-run.`,
    );
    process.exit(1);
  }
  throw err;
}

const files = entries
  .filter((f) => IMG.test(f))
  .filter((f) => statSync(resolve(DIR, f)).isFile());

const bios = loadBios();

const map = {};
const collisions = [];
const unmatched = [];
for (const f of files) {
  const name = nameFromFilename(f);
  const bio = findBio(name, bios);
  if (!bio) {
    unmatched.push({ file: f, parsed: name });
    continue;
  }
  if (bio.key in map) collisions.push({ bio: bio.name, kept: map[bio.key], also: f });
  else map[bio.key] = f;
}

const biosWithoutPhoto = bios.filter((b) => !(b.key in map)).map((b) => b.name);

writeFileSync(
  OUT,
  JSON.stringify(
    { updatedAt: new Date().toISOString(), photos: map },
    null,
    2,
  ) + "\n",
);
console.log(
  `Wrote ${Object.keys(map).length} bio → photo entries to data/bio-photos.json ` +
    `(${files.length} photo file(s), ${bios.length} bio(s))`,
);
if (unmatched.length) {
  console.log(`  ${unmatched.length} photo(s) with no matching bio:`);
  for (const u of unmatched) console.log(`    ${u.file}  (parsed name: "${u.parsed}")`);
}
if (collisions.length) {
  console.log(`  ${collisions.length} collision(s) — first file wins:`);
  for (const c of collisions.slice(0, 5)) {
    console.log(`    ${c.bio}: kept ${c.kept}, also saw ${c.also}`);
  }
}
if (biosWithoutPhoto.length) {
  console.log(`  ${biosWithoutPhoto.length} bio(s) without a survey photo:`);
  for (const n of biosWithoutPhoto) console.log(`    ${n}`);
}
