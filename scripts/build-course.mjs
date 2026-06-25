// Converts a WTM course KML (the KMZ, unzipped) into a course-data JS
// module: one lap as lat/lng points plus obstacle locations.
//
// Defaults: reads data/course.kml, writes assets/course-data.js.
// Re-target either side with --input / --output, e.g. a private 2026
// build that doesn't disturb the public file:
//   node scripts/build-course.mjs \
//     --input scratchpad/doc-2026.kml \
//     --output assets/course-data-2026.js
//
// Obstacles are taken from KML placemarks whose <name> starts with
// "N. <label>" (so the KML itself supplies this year's lineup). If a
// placemark has just a number and no label, we fall back to last year's
// hardcoded names so existing files keep building.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
function arg(flag, dflt) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : dflt;
}
// Default paths resolve relative to the script (so a plain
// `node scripts/build-course.mjs` still works); explicit --input /
// --output flags resolve relative to the cwd, which is the natural CLI
// behaviour, and absolute paths pass through unchanged.
const scriptDir = fileURLToPath(new URL(".", import.meta.url));
function resolvePath(flag, cliValue, scriptRelDefault) {
  if (cliValue === undefined) return resolve(scriptDir, scriptRelDefault);
  return isAbsolute(cliValue) ? cliValue : resolve(process.cwd(), cliValue);
}
const inputArg = arg("--input");
const outputArg = arg("--output");
const inputPath = resolvePath("--input", inputArg, "../data/course.kml");
const outputPath = resolvePath("--output", outputArg, "../assets/course-data.js");

// Last year's obstacle lineup — used only as a fallback if a KML
// placemark name is just "N." with no label text.
const FALLBACK_OBSTACLE_NAMES = [
  "BREXIT BARRIER", "TWINKLE TOEZZZ", "SKIDMARKED", "PYRAMID SCHEME 2.0",
  "FIRE FLY", "RAT FROST", "KISS OF MUD", "CHUNKY MONKEY",
  "BLOCK NESS MONSTER", "NETFLICKS & CHILL", "MOAT-ER FLOATING",
  "LUCIFER'S LUGGAGE", "POLE DANCER", "EVEREST", "RAIN MAN", "MUD MILE",
  "STAIRWAY TO HEAVEN", "SWINGS BOTH WAYS", "MUDDERHORN",
  "ELECTROSHOCK THERAPY",
];

const M_PER_MILE = 1609.344;
const kml = readFileSync(inputPath, "utf8");

// Decode the handful of XML entities KML actually uses in names.
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parsePlacemarks(xml) {
  const out = [];
  const re = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g;
  let m;
  while ((m = re.exec(xml))) {
    const blk = m[1];
    const rawName = ((blk.match(/<name>([\s\S]*?)<\/name>/) || [])[1] || "").trim();
    const name = decodeEntities(rawName);
    const isLine = /<LineString>/.test(blk);
    const raw = ((blk.match(/<coordinates>([\s\S]*?)<\/coordinates>/) || [])[1] || "").trim();
    const coords = raw
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.split(",").map(Number).slice(0, 2)); // [lon, lat]
    out.push({ name, isLine, coords });
  }
  return out;
}

function haversine(a, b) {
  const R = 6371000;
  const toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b[1] - a[1]);
  const dLon = toR(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a[1])) * Math.cos(toR(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const placemarks = parsePlacemarks(kml);
const loop = placemarks.find((p) => p.isLine && /loop/i.test(p.name));
if (!loop) throw new Error("course loop LineString not found in KML");

// Cumulative distance along the loop.
const cum = [0];
for (let i = 1; i < loop.coords.length; i++) {
  cum[i] = cum[i - 1] + haversine(loop.coords[i - 1], loop.coords[i]);
}
const totalMiles = cum[cum.length - 1] / M_PER_MILE;

// Course as lat/lng points, each carrying its cumulative mile.
const course = loop.coords.map(([lon, lat], i) => ({
  lat: +lat.toFixed(6),
  lng: +lon.toFixed(6),
  mile: +(cum[i] / M_PER_MILE).toFixed(4),
}));

// Obstacles: keep their real KML coordinates, plus the mile of the
// nearest point on the loop (used for ordering / "next obstacle").
const obstacles = [];
let kmlNamedCount = 0;
for (const p of placemarks) {
  const m = p.name.match(/^\s*(\d+)\.\s*(.*?)\s*$/);
  if (!m || p.isLine || p.coords.length !== 1) continue;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > 20) continue;
  const kmlLabel = (m[2] || "").trim();
  const name = kmlLabel || FALLBACK_OBSTACLE_NAMES[n - 1];
  if (kmlLabel) kmlNamedCount++;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < loop.coords.length; i++) {
    const d = haversine(p.coords[0], loop.coords[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  obstacles.push({
    n,
    name,
    lat: +p.coords[0][1].toFixed(6),
    lng: +p.coords[0][0].toFixed(6),
    mile: +(cum[best] / M_PER_MILE).toFixed(3),
  });
}
obstacles.sort((a, b) => a.mile - b.mile);

const file = `// GENERATED by scripts/build-course.mjs.
// Do not hand-edit COURSE/OBSTACLES — re-run the script instead.
// TIMING_MATS is safe to edit, but a re-run will reset it to [].

// Full lap length in miles.
export const LAP_MILES = ${totalMiles.toFixed(3)};

// One lap as { lat, lng } points, each with its cumulative mile.
export const COURSE = ${JSON.stringify(course)};

// Obstacles at their real coordinates; mile is the nearest loop point.
export const OBSTACLES = ${JSON.stringify(obstacles, null, 2)};

// Timing mats — add { name, lat, lng, mile } entries once known.
export const TIMING_MATS = [];
`;

writeFileSync(outputPath, file);
const nameSrc =
  kmlNamedCount === obstacles.length
    ? "KML"
    : kmlNamedCount > 0
      ? `KML (${kmlNamedCount}) + fallback (${obstacles.length - kmlNamedCount})`
      : "fallback";
console.log(
  `course: ${totalMiles.toFixed(2)} mi, ${course.length} points, ` +
    `${obstacles.length} obstacles · names: ${nameSrc} · -> ${outputPath}`,
);
