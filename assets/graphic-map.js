import { LAP_MILES, OBSTACLES, TIMING_MATS } from "./course-data.js";
import { project, drawMap } from "./predict.js";
import { startGraphic, rowByBib } from "./graphic-base.js";

const canvas = document.getElementById("g-canvas");
const nameEl = document.getElementById("g-name");
const metaEl = document.getElementById("g-meta");
const emptyEl = document.getElementById("g-empty");

function setEmpty(msg) {
  emptyEl.hidden = false;
  emptyEl.textContent = msg;
  canvas.hidden = true;
  nameEl.textContent = "";
  metaEl.textContent = "";
}

startGraphic((pred) => {
  if (!pred || pred.bib == null) return setEmpty("Waiting for selection…");
  const r = rowByBib(pred.bib);
  if (!r) return setEmpty(`Bib ${pred.bib} not in feed`);

  emptyEl.hidden = true;
  canvas.hidden = false;
  const p = project(r, pred.goalMiles, LAP_MILES);
  nameEl.textContent = `#${r.Bib}  ${r.Name}`;
  metaEl.textContent = `${p.miles.toFixed(1)} mi  •  goal ${pred.goalMiles} mi`;
  drawMap(canvas, p, OBSTACLES, TIMING_MATS);
});
