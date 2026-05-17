// Shared plumbing for the vMix browser-input graphics: loads the results
// snapshot and resolves which athletes/goal to show — from Firebase live
// state, or from ?bibs=1,2,3&goal=75 URL params to pin it manually.

import { configured, watchControl } from "./firebase.js";

let results = { slices: {} };
let pred = null;

const params = new URLSearchParams(location.search);
const override = params.get("bibs") || params.get("bib");
if (override) {
  pred = {
    bibs: override.split(",").map((s) => s.trim()).filter(Boolean),
    goalMiles: parseFloat(params.get("goal")) || 50,
  };
}

// Normalize a prediction value to a bibs array (supports the older
// single-bib shape too).
export function predBibs(p) {
  if (!p) return [];
  if (Array.isArray(p.bibs)) return p.bibs;
  if (p.bib != null) return [p.bib];
  return [];
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

  if (!override && configured) {
    watchControl("prediction", (val) => {
      pred = val;
      run();
    });
  }
  window.addEventListener("resize", run);
  load();
  setInterval(load, 30_000);
}
