import { LAP_MILES, COURSE, OBSTACLES, TIMING_MATS } from "./course-data.js";
import { project, advance, drawMap } from "./predict.js";
import { startGraphic, rowByBib } from "./graphic-base.js";

const canvas = document.getElementById("g-canvas");
const nameEl = document.getElementById("g-name");
const metaEl = document.getElementById("g-meta");
const emptyEl = document.getElementById("g-empty");

// The course always draws. The athlete dot ticks forward from the last
// feed-accurate projection once per second; a stalled feed is capped.
const MAX_EXTRAPOLATE_SEC = 600;
let basis = null;
let waitLabel = "Waiting for athlete…";

emptyEl.hidden = true;
canvas.hidden = false;

function tick() {
  let live = null;
  if (basis) {
    const secs = Math.min(MAX_EXTRAPOLATE_SEC, (Date.now() - basis.t) / 1000);
    live = advance(basis.p, secs);
    metaEl.textContent = `${live.miles.toFixed(1)} mi  •  goal ${basis.p.goalMiles} mi`;
  } else {
    metaEl.textContent = waitLabel;
  }
  drawMap(canvas, live, COURSE, OBSTACLES, TIMING_MATS);
}

startGraphic((pred) => {
  if (!pred || pred.bib == null) {
    basis = null;
    nameEl.textContent = "";
    waitLabel = "Waiting for athlete…";
    return tick();
  }
  const r = rowByBib(pred.bib);
  if (!r) {
    basis = null;
    nameEl.textContent = "";
    waitLabel = `Bib ${pred.bib} not in feed yet`;
    return tick();
  }
  nameEl.textContent = `#${r.Bib}  ${r.Name}`;
  basis = { p: project(r, pred.goalMiles, LAP_MILES), t: Date.now() };
  tick();
});

setInterval(tick, 1000);
