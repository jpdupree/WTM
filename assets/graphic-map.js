import { LAP_MILES } from "./course-data.js";
import { project, advance, markDim, SERIES_COLORS } from "./predict.js";
import { startGraphic, rowByBib, predBibs, predFocus } from "./graphic-base.js";
import { watchRabbits } from "./firebase.js";
import { createCourseMap } from "./coursemap.js";

const banner = document.getElementById("g-banner");
const rabbitsBtn = document.getElementById("g-rabbits");
const cmap = createCourseMap("map");

// Each athlete's last feed-accurate projection plus its capture time;
// dots are extrapolated forward once per second and re-sync on each feed.
const MAX_EXTRAPOLATE_SEC = 600;
let basis = [];
let focus = [];

function tick() {
  if (basis.length === 0) return;
  const now = Date.now();
  const entries = basis.map((b) => {
    const secs = Math.min(MAX_EXTRAPOLATE_SEC, (now - b.t) / 1000);
    return { mile: advance(b.p, secs).miles, label: b.bib, color: b.color, bib: b.bib };
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
  rabbits = Object.values(obj || {}).filter(
    (r) => r && typeof r.lat === "number" && typeof r.lng === "number",
  );
  drawRabbits();
});

drawRabbits();
