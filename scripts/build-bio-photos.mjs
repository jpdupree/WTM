// Build data/bio-photos.json from a local folder of survey-uploaded photos.
//
// Drop survey photos into data/bio-photos/ — Google Forms downloads them as
// `<original> - <Full Name>.<ext>`, so the athlete name lives after the last
// " - " in the filename. The output is { updatedAt, photos: { "<key>": "<filename>" } }
// where <key> is the same lowercased, sorted token-set bios.js uses to match
// athletes (e.g. "anne carolyn clifford" → "anne carolyn clifford").
//
// Run it after refreshing the folder:
//   node scripts/build-bio-photos.mjs
// Commit both data/bio-photos.json and the photo files.

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, "../data/bio-photos");
const OUT = resolve(__dirname, "../data/bio-photos.json");

const IMG = /\.(jpe?g|png|webp|gif|heic)$/i;

function tokens(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[.,'"`]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Survey downloads: "<original filename> - <Athlete Name>.<ext>".
// If there's no " - " we fall back to the stem so bib-style "1146.jpg" still
// keys on "1146" (won't match a name but won't crash either).
function nameFromFilename(fname) {
  const stem = fname.replace(IMG, "");
  const i = stem.lastIndexOf(" - ");
  return (i >= 0 ? stem.slice(i + 3) : stem).trim();
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

const map = {};
const collisions = [];
const skipped = [];
for (const f of files) {
  const name = nameFromFilename(f);
  const toks = tokens(name);
  if (toks.length < 2) {
    skipped.push(f);
    continue;
  }
  const key = [...toks].sort().join(" ");
  if (key in map) collisions.push({ key, kept: map[key], also: f });
  else map[key] = f;
}

writeFileSync(
  OUT,
  JSON.stringify(
    { updatedAt: new Date().toISOString(), photos: map },
    null,
    2,
  ) + "\n",
);
console.log(
  `Wrote ${Object.keys(map).length} name → photo entries to data/bio-photos.json`,
);
if (skipped.length) {
  console.log(
    `  Skipped ${skipped.length} file(s) without parseable name:`,
    skipped.slice(0, 5).join(", "),
    skipped.length > 5 ? "…" : "",
  );
}
if (collisions.length) {
  console.log(`  ${collisions.length} name collision(s) — first file wins:`);
  for (const c of collisions.slice(0, 5)) {
    console.log(`    ${c.key}: kept ${c.kept}, also saw ${c.also}`);
  }
}
