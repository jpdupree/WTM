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

// Interpolate an {x,y} position at a given mile along the course.
function pointAtMile(course, mile) {
  const last = course[course.length - 1];
  if (mile <= 0) return course[0];
  if (mile >= last.mile) return last;
  for (let i = 1; i < course.length; i++) {
    if (course[i].mile >= mile) {
      const a = course[i - 1];
      const b = course[i];
      const f = (mile - a.mile) / ((b.mile - a.mile) || 1);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return last;
}

// One lap of the real course with the athlete's position and obstacles.
export function drawMap(canvas, p, course, obstacles, mats) {
  const { ctx, w, h } = fitCanvas(canvas);
  if (!course || course.length < 2) {
    ctx.fillStyle = COL.muted;
    ctx.font = "14px Segoe UI, sans-serif";
    ctx.fillText("Course data not loaded", 20, h / 2);
    return;
  }

  const pad = 54;
  let minx = 1, maxx = 0, miny = 1, maxy = 0;
  for (const pt of course) {
    minx = Math.min(minx, pt.x); maxx = Math.max(maxx, pt.x);
    miny = Math.min(miny, pt.y); maxy = Math.max(maxy, pt.y);
  }
  const scale = Math.min(
    (w - 2 * pad) / (maxx - minx || 1),
    (h - 2 * pad) / (maxy - miny || 1),
  );
  const offX = (w - (maxx - minx) * scale) / 2 - minx * scale;
  const offY = (h - (maxy - miny) * scale) / 2 - miny * scale;
  const S = (pt) => [offX + pt.x * scale, offY + pt.y * scale];

  // course line
  ctx.strokeStyle = "rgba(140,160,180,0.7)";
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  course.forEach((pt, i) => {
    const [x, y] = S(pt);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.stroke();

  // obstacles — numbered markers
  ctx.font = "bold 10px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  (obstacles || []).forEach((o, i) => {
    const [x, y] = S(pointAtMile(course, o.mile));
    ctx.fillStyle = "#0c1014";
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COL.actual;
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = COL.actual;
    ctx.fillText(String(o.n ?? i + 1), x, y + 3.5);
  });

  // timing mats
  for (const m of mats || []) {
    const [x, y] = S(pointAtMile(course, m.mile));
    ctx.fillStyle = COL.goal;
    ctx.fillRect(x - 4, y - 4, 8, 8);
  }

  // start / finish
  const [sx, sy] = S(course[0]);
  ctx.fillStyle = COL.goal;
  ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill();

  // athlete dot
  const lapFrac = ((p.miles % p.lapMiles) + p.lapMiles) % p.lapMiles;
  const [ax, ay] = S(pointAtMile(course, lapFrac));
  ctx.beginPath(); ctx.arc(ax, ay, 10, 0, Math.PI * 2);
  ctx.fillStyle = COL.projection; ctx.fill();
  ctx.strokeStyle = "#1a1207"; ctx.lineWidth = 2.5; ctx.stroke();

  // lap badge
  ctx.textAlign = "left";
  ctx.fillStyle = COL.text;
  ctx.font = "bold 16px Segoe UI, sans-serif";
  ctx.fillText(`Lap ${p.laps + 1}  •  ${p.miles.toFixed(2)} mi`, 16, h - 16);
}
