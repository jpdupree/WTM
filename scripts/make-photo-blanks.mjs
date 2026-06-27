// Creates a transparent placeholder PNG for every competitor bib that
// doesn't already have a photo, so the vMix solo-stats graphic always
// has a file to load — a bib with no photo then shows nothing instead
// of keeping the previous athlete's picture.
//
//   node scripts/make-photo-blanks.mjs "G:\path\to\Athlete Photos"
//
// Bibs come from data/athlete-bibs.json (the full roster, generated from
// the participant list) when present, else from data/results.json (the
// live feed). A bib counts as "has a photo" if ANY file in the folder
// starts with that bib (so "1006.png" or "1006 Austin.png" both match),
// so a real photo is never shadowed by a blank. Existing files are NEVER
// overwritten — real photos are safe. Re-run whenever the roster changes.

import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// A 1x1 fully transparent PNG — vMix scales it, so it shows as nothing.
const BLANK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk" +
    "YAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const folder = process.argv[2];
if (!folder) {
  console.error('Usage: node scripts/make-photo-blanks.mjs "<Athlete Photos folder>"');
  process.exit(1);
}
if (!existsSync(folder)) {
  console.error(`Folder not found: ${folder}`);
  process.exit(1);
}

// Roster: prefer the committed bib list, fall back to the live feed.
async function loadBibs() {
  try {
    const roster = JSON.parse(
      await readFile(new URL("../data/athlete-bibs.json", import.meta.url), "utf8"),
    );
    if (Array.isArray(roster.bibs) && roster.bibs.length) {
      console.log(`Roster: ${roster.bibs.length} bibs from data/athlete-bibs.json`);
      return roster.bibs.map(String);
    }
  } catch {
    /* no roster file — fall through to the feed */
  }
  const data = JSON.parse(
    await readFile(new URL("../data/results.json", import.meta.url), "utf8"),
  );
  const rows = (data.slices && data.slices.overall) || [];
  console.log(`Roster: ${rows.length} bibs from data/results.json (no athlete-bibs.json)`);
  return [...new Set(rows.map((r) => String(r.Bib)).filter(Boolean))];
}

const bibs = [...new Set(await loadBibs())];

// Bibs that already have any image file (real photo or prior placeholder).
const existingBibs = new Set();
for (const name of await readdir(folder)) {
  if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
  const m = name.match(/^(\d+)/);
  if (m) existingBibs.add(m[1]);
}

let created = 0;
let existing = 0;
for (const bib of bibs) {
  if (existingBibs.has(bib)) {
    existing++;
    continue;
  }
  await writeFile(join(folder, `${bib}.png`), BLANK_PNG);
  created++;
}

console.log(
  `${bibs.length} bibs — ${existing} already have a photo/placeholder, ` +
    `${created} transparent placeholders created.`,
);
