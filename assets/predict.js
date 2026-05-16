// Pace projection math plus canvas drawing for the predictive chart and
// map. Shared by the commentator preview and the two vMix graphic pages.

export function hmsToSec(s) {
  if (!s) return null;
  const p = String(s).split(":").map((n) => parseInt(n, 10));
  if (p.some((n) => Number.isNaN(n))) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return null;
}

export function secToHms(sec) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function findRow(results, bib) {
  const slices = (results && results.slices) || {};
  const rows = slices.overall || [];
  return rows.find((r) => String(r.Bib) === String(bib)) || null;
}

// Project an athlete's run toward a mileage goal at their current pace.
export function project(row, goalMiles, lapMiles) {
  const laps = parseInt(row?.Laps, 10) || 0;
  const miles = parseFloat(row?.Distance) || laps * lapMiles;
  const elapsedSec = hmsToSec(row?.TotalTime);
  const lastLapSec = hmsToSec(row?.LastLapTime);
  const avgPace = miles > 0 && elapsedSec ? elapsedSec / miles : null;
  const lastPace = lastLapSec ? lastLapSec / lapMiles : null;
  const pace = lastPace ?? avgPace; // seconds per mile
  const remaining = Math.max(0, goalMiles - miles);
  const reached = miles >= goalMiles;
  const etaSec =
    pace != null && elapsedSec != null && !reached
      ? elapsedSec + remaining * pace
      : elapsedSec;
  return {
    laps, miles, elapsedSec, lastLapSec, avgPace, lastPace, pace,
    goalMiles, remaining, etaSec, reached, lapMiles,
  };
}

// Advance a projection by `elapsedSec` of real time at the athlete's
// current pace. Lets the map dot tick forward between feed updates;
// the next feed snapshot re-syncs it to the timed position.
export function advance(p, elapsedSec) {
  if (!p || p.pace == null || !(elapsedSec > 0)) return p;
  const miles = p.miles + elapsedSec / p.pace;
  return { ...p, miles, laps: Math.floor(miles / p.lapMiles) };
}

// --- canvas helpers --------------------------------------------------

function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

const COL = {
  axis: "#5a6b7a",
  grid: "rgba(120,140,160,0.18)",
  actual: "#4ea3ff",
  projection: "#f5a623",
  goal: "#46d17f",
  text: "#e8edf2",
  muted: "#9fb0bf",
};

// Distance-vs-time projection chart.
export function drawChart(canvas, p) {
  const { ctx, w, h } = fitCanvas(canvas);
  const padL = 56, padR = 24, padT = 24, padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const etaH = (p.etaSec ?? p.elapsedSec ?? 0) / 3600;
  const elapsedH = (p.elapsedSec ?? 0) / 3600;
  const xMax = Math.max(etaH, elapsedH, 1) * 1.1;
  const yMax = Math.max(p.goalMiles, p.miles, 1) * 1.15;

  const X = (hrs) => padL + (hrs / xMax) * plotW;
  const Y = (mi) => padT + plotH - (mi / yMax) * plotH;

  ctx.strokeStyle = COL.grid;
  ctx.fillStyle = COL.muted;
  ctx.font = "11px Segoe UI, sans-serif";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padT + (plotH / 5) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    const mi = yMax * (1 - i / 5);
    ctx.fillText(mi.toFixed(0) + " mi", 8, y + 4);
  }
  for (let i = 0; i <= 6; i++) {
    const x = padL + (plotW / 6) * i;
    const hrs = xMax * (i / 6);
    ctx.fillText(hrs.toFixed(1) + "h", x - 10, h - 16);
  }

  ctx.strokeStyle = COL.axis;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // goal line
  ctx.strokeStyle = COL.goal;
  ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(padL, Y(p.goalMiles)); ctx.lineTo(padL + plotW, Y(p.goalMiles)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COL.goal;
  ctx.fillText("Goal " + p.goalMiles + " mi", padL + plotW - 86, Y(p.goalMiles) - 6);

  // actual progress (origin -> current)
  ctx.strokeStyle = COL.actual;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(elapsedH), Y(p.miles)); ctx.stroke();

  // projection (current -> ETA at goal)
  if (!p.reached && p.etaSec != null) {
    ctx.strokeStyle = COL.projection;
    ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.moveTo(X(elapsedH), Y(p.miles)); ctx.lineTo(X(etaH), Y(p.goalMiles)); ctx.stroke();
    ctx.setLineDash([]);
  }

  // markers
  const dot = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  };
  dot(X(elapsedH), Y(p.miles), COL.actual);
  if (!p.reached && p.etaSec != null) dot(X(etaH), Y(p.goalMiles), COL.projection);

  ctx.fillStyle = COL.text;
  ctx.font = "12px Segoe UI, sans-serif";
  ctx.fillText(p.miles.toFixed(1) + " mi now", X(elapsedH) + 8, Y(p.miles) - 8);
}

// One-lap loop with the athlete's current position and obstacle markers.
export function drawMap(canvas, p, obstacles, mats) {
  const { ctx, w, h } = fitCanvas(canvas);
  const cx = w / 2, cy = h / 2;
  const rx = Math.min(w, h) * 0.36;
  const ry = Math.min(w, h) * 0.30;
  const at = (frac) => {
    const a = -Math.PI / 2 + frac * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  };

  // track
  ctx.strokeStyle = "rgba(120,140,160,0.5)";
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();

  // obstacles / mats
  ctx.font = "11px Segoe UI, sans-serif";
  for (const o of obstacles || []) {
    const [x, y] = at((o.mile % p.lapMiles) / p.lapMiles);
    ctx.fillStyle = COL.muted;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.text;
    ctx.fillText(o.name, x + 8, y + 4);
  }
  for (const m of mats || []) {
    const [x, y] = at((m.mile % p.lapMiles) / p.lapMiles);
    ctx.fillStyle = COL.goal;
    ctx.fillRect(x - 4, y - 4, 8, 8);
  }

  // athlete position on the current lap
  const lapFrac = ((p.miles % p.lapMiles) / p.lapMiles) || 0;
  const [ax, ay] = at(lapFrac);
  ctx.fillStyle = COL.projection;
  ctx.beginPath(); ctx.arc(ax, ay, 9, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#1a1207";
  ctx.lineWidth = 2;
  ctx.stroke();

  // centre readout
  ctx.fillStyle = COL.text;
  ctx.textAlign = "center";
  ctx.font = "bold 26px Segoe UI, sans-serif";
  ctx.fillText("Lap " + (p.laps + 1), cx, cy - 6);
  ctx.font = "15px Segoe UI, sans-serif";
  ctx.fillStyle = COL.muted;
  ctx.fillText(p.miles.toFixed(1) + " mi total", cx, cy + 18);
  ctx.textAlign = "left";
}
