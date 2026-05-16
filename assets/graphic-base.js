// Shared plumbing for the vMix browser-input graphics: loads the results
// snapshot and resolves which athlete/goal to show — from Firebase live
// state, or from ?bib=&goal= URL params if you'd rather pin it manually.

import { configured, watchControl } from "./firebase.js";

let results = { slices: {} };
let pred = null;

const params = new URLSearchParams(location.search);
const overrideBib = params.get("bib");
if (overrideBib) {
  pred = { bib: overrideBib, goalMiles: parseFloat(params.get("goal")) || 50 };
}

export function rowByBib(bib) {
  const s = results.slices || {};
  for (const key of ["overall", "men", "women", "teams"]) {
    const hit = (s[key] || []).find((r) => String(r.Bib) === String(bib));
    if (hit) return hit;
  }
  return null;
}

// renderFn(pred) runs on every data refresh, selection change, or resize.
export function startGraphic(renderFn) {
  const run = () => renderFn(pred);

  async function load() {
    try {
      const res = await fetch("../data/results.json?t=" + Date.now(), {
        cache: "no-store",
      });
      if (res.ok) results = await res.json();
    } catch {
      /* keep previous data */
    }
    run();
  }

  if (!overrideBib && configured) {
    watchControl("prediction", (val) => {
      pred = val;
      run();
    });
  }
  window.addEventListener("resize", run);
  load();
  setInterval(load, 30_000);
}
