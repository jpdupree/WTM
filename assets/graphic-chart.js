import { LAP_MILES } from "./course-data.js";
import { project, drawChart, chartLegend, SERIES_COLORS } from "./predict.js";
import { startGraphic, rowByBib, predBibs } from "./graphic-base.js";

const canvas = document.getElementById("g-canvas");
const nameEl = document.getElementById("g-name");
const metaEl = document.getElementById("g-meta");
const emptyEl = document.getElementById("g-empty");
const legendEl = document.getElementById("g-legend");

function setEmpty(msg) {
  emptyEl.hidden = false;
  emptyEl.textContent = msg;
  canvas.hidden = true;
  nameEl.textContent = "";
  metaEl.textContent = "";
  legendEl.innerHTML = "";
}

startGraphic((pred) => {
  const bibs = predBibs(pred);
  const goal = (pred && pred.goalMiles) || 50;
  const entries = [];
  bibs.forEach((bib, i) => {
    const r = rowByBib(bib);
    if (r) {
      entries.push({
        p: project(r, goal, LAP_MILES),
        label: `#${r.Bib} ${r.Name}`,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      });
    }
  });

  if (entries.length === 0) {
    return setEmpty(bibs.length ? "Selected athletes not in feed yet" : "Waiting for selection…");
  }

  emptyEl.hidden = true;
  canvas.hidden = false;
  nameEl.textContent =
    entries.length === 1 ? entries[0].label : `${entries.length} athletes`;
  metaEl.textContent = `Goal ${goal} mi`;
  drawChart(canvas, entries);
  legendEl.innerHTML = "";
  legendEl.appendChild(chartLegend(entries));
});
