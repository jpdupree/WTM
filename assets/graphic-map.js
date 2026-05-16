import { LAP_MILES, COURSE, OBSTACLES, TIMING_MATS } from "./course-data.js";
import { project, advance, drawMap } from "./predict.js";
import { startGraphic, rowByBib } from "./graphic-base.js";

const canvas = document.getElementById("g-canvas");
const nameEl = document.getElementById("g-name");
const metaEl = document.getElementById("g-meta");
const emptyEl = document.getElementById("g-empty");

// Latest feed-accurate projection and the moment it was captured. The
// dot is extrapolated forward from here once per second; each new feed
// snapshot re-syncs it. Capped so a stalled feed can't run the dot away.
const MAX_EXTRAPOLATE_SEC = 600;
let basis = null;

function setEmpty(msg) {
  basis = null;
  emptyEl.hidden = false;
  emptyEl.textContent = msg;
  canvas.hidden = true;
  nameEl.textContent = "";
  metaEl.textContent = "";
}

function tick() {
  if (!basis) return;
  const secs = Math.min(MAX_EXTRAPOLATE_SEC, (Date.now() - basis.t) / 1000);
  const live = advance(basis.p, secs);
  metaEl.textContent = `${live.miles.toFixed(1)} mi  •  goal ${basis.p.goalMiles} mi`;
  drawMap(canvas, live, COURSE, OBSTACLES, TIMING_MATS);
}

startGraphic((pred) => {
  if (!pred || pred.bib == null) return setEmpty("Waiting for selection…");
  const r = rowByBib(pred.bib);
  if (!r) return setEmpty(`Bib ${pred.bib} not in feed`);

  emptyEl.hidden = true;
  canvas.hidden = false;
  nameEl.textContent = `#${r.Bib}  ${r.Name}`;
  basis = { p: project(r, pred.goalMiles, LAP_MILES), t: Date.now() };
  tick();
});

setInterval(tick, 1000);
