import { project, markDim, SERIES_COLORS, secondsSinceSeen, mapMile } from "./predict.js";
import { startGraphic, rowByBib, predBibs, predFocus } from "./graphic-base.js";
import { watchRabbits } from "./firebase.js";
import { rabbitList } from "./rabbits.js";
import { createCourseMap } from "./coursemap.js";
// Private 2026 course — same source as the commentator and rabbit pages.
import * as course2026 from "./course-data-2026.js";
const { LAP_MILES } = course2026;

const banner = document.getElementById("g-banner");
const rabbitsBtn = document.getElementById("g-rabbits");
const cmap = createCourseMap("map", course2026);

// Each athlete's last feed projection plus the feed row it came from;
// the dot is placed from the row's last crossing projected forward to
// "now" once per second, and re-synced on each feed update.
const MAX_EXTRAPOLATE_SEC = 600;
let basis = [];
let focus = [];

function tick() {
  if (basis.length === 0) return;
  const now = Date.now();
  const entries = basis.map((b) => {
    // Prefer time since the athlete's last mat crossing; fall back to
    // feed-age when the row has no usable time-of-day.
    const sinceSeen = secondsSinceSeen(b.r);
    const elapsed = sinceSeen != null ? sinceSeen : (now - b.t) / 1000;
    return {
      mile: mapMile(b.p, Math.min(elapsed, MAX_EXTRAPOLATE_SEC * 12), LAP_MILES),
      label: b.bib,
      color: b.color,
      bib: b.bib,
    };
  });
  markDim(entries, focus);
  cmap.setAthletes(entries);
}

startGraphic((pred) => {
  const bibs = predBibs(pred);
  const goal = (pred && pred.goalMiles) || 50;
  focus = predFocus(pred);
  const t = Date.now();
  basis = [];
  bibs.forEach((bib, i) => {
    const r = rowByBib(bib);
    if (r) {
      basis.push({
        p: project(r, goal, LAP_MILES),
        r,
        t,
        bib: String(r.Bib),
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      });
    }
  });

  if (basis.length === 0) {
    cmap.clearAthletes();
    banner.textContent = bibs.length
      ? "Selected athletes not in feed yet"
      : "Waiting for selection…";
  } else {
    banner.textContent =
      basis.length === 1 ? `#${basis[0].bib}` : `${basis.length} athletes`;
  }
  tick();
});

setInterval(tick, 1000);

// --- rabbits (camera-operator GPS) -----------------------------------
let showRabbits = new URLSearchParams(location.search).get("rabbits") === "1";
let rabbits = [];

function drawRabbits() {
  cmap.setRabbits(showRabbits ? rabbits : []);
  rabbitsBtn.classList.toggle("on", showRabbits);
  rabbitsBtn.textContent = `Rabbits${rabbits.length ? ` (${rabbits.length})` : ""}`;
}

rabbitsBtn.addEventListener("click", () => {
  showRabbits = !showRabbits;
  drawRabbits();
});

watchRabbits((obj) => {
  rabbits = rabbitList(obj);
  drawRabbits();
});

drawRabbits();
