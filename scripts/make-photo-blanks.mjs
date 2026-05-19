// Creates a transparent placeholder PNG for every athlete bib that
// doesn't already have a photo, so the vMix solo-stats graphic always
// has a file to load — a bib with no photo then shows nothing instead
// of keeping the previous athlete's picture.
//
//   node scripts/make-photo-blanks.mjs "G:\path\to\Athlete Photos"
//
// Bibs come from data/results.json (the results feed). Existing files
// are NEVER overwritten — real photos are safe. Run it before the event
// and again whenever the entrant list changes.

import { readFile, writeFile } from "node:fs/promises";
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

const data = JSON.parse(
  await readFile(new URL("../data/results.json", import.meta.url), "utf8"),
);
const rows = (data.slices && data.slices.overall) || [];
const bibs = [...new Set(rows.map((r) => String(r.Bib)).filter(Boolean))];

let created = 0;
let existing = 0;
for (const bib of bibs) {
  const file = join(folder, `${bib}.png`);
  if (existsSync(file)) {
    existing++;
    continue;
  }
  await writeFile(file, BLANK_PNG);
  created++;
}

console.log(
  `${bibs.length} bibs — ${existing} already have a photo/placeholder, ` +
    `${created} transparent placeholders created.`,
);
