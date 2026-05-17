// Pace projection plus the canvas chart. The map is drawn separately
// with Leaflet (see coursemap.js).

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

// Distinct colours for multi-athlete chart lines and map dots.
export const SERIES_COLORS = [
  "#f5a623", "#4ea3ff", "#46d17f", "#e0556e", "#b07cf0",
  "#f0c93f", "#3fd0c8", "#ff8c42", "#7f8fff", "#d44fb0",
];

// The predictive chart's time axis is fixed to the race window.
export const CHART_MAX_HOURS = 25.5;

// Per-lap duration fields in the enriched feed, in order. Note lap 21
// is "Twentyfirstlap" (lower-case L) — that is the actual feed key.
const LAP_FIELDS = [
  "FirstLap", "SecondLap", "ThirdLap", "FourthLap", "FifthLap",
  "SixthLap", "SeventhLap", "EighthLap", "NinthLap", "TenthLap",
  "EleventhLap", "TwelfthLap", "ThirteenthLap", "FourteenthLap",
  "FifteenthLap", "SixteenthLap", "SeventeenthLap", "EighteenthLap",
  "NineteenthLap", "TwentiethLap", "Twentyfirstlap", "TwentysecondLap",
  "TwentythirdLap", "TwentyfourthLap", "TwentyfifthLap",
];

// Cumulative { miles, sec } points at each completed lap, from the feed's
// per-lap durations. Starts at the origin; empty when there's no lap data.
function lapSplits(row, milesPerLap) {
  const splits = [{ miles: 0, sec: 0 }];
  let cum = 0;
  for (let i = 0; i < LAP_FIELDS.length; i++) {
    const d = hmsToSec(row?.[LAP_FIELDS[i]]);
    if (d == null) break;
    cum += d;
    splits.push({ miles: (i + 1) * milesPerLap, sec: cum });
  }
  return splits;
}

// Laps averaged for the pace projection — recent enough to reflect
// fatigue and the night slow-down, smoothed enough to absorb one
// outlier lap (a long pit/rest stop). Change to taste.
const PROJECTION_LAPS = 3;

// Average pace (sec/mile) over the last `n` completed laps.
function recentPace(splits, n) {
  if (splits.length < 2) return null;
  const last = splits[splits.length - 1];
  const back = splits[Math.max(0, splits.length - 1 - n)];
  const dMiles = last.miles - back.miles;
  return dMiles > 0 ? (last.sec - back.sec) / dMiles : null;
}

// Project an athlete's run toward a mileage goal at their recent pace.
export function project(row, goalMiles, lapMiles) {
  const laps = parseInt(row?.Laps, 10) || 0;
  const miles = parseFloat(row?.Distance) || laps * lapMiles;
  const elapsedSec = hmsToSec(row?.TotalTime);
  const lastLapSec = hmsToSec(row?.LastLapTime);
  const splits = lapSplits(row, laps > 0 ? miles / laps : lapMiles);
  const avgPace = miles > 0 && elapsedSec ? elapsedSec / miles : null;
  const lastPace = lastLapSec ? lastLapSec / lapMiles : null;
  // Recent-laps pace, falling back to whole-race average then last lap.
  const pace = recentPace(splits, PROJECTION_LAPS) ?? avgPace ?? lastPace;
  const remaining = Math.max(0, goalMiles - miles);
  const reached = miles >= goalMiles;
  const etaSec =
    pace != null && elapsedSec != null && !reached
      ? elapsedSec + remaining * pace
      : elapsedSec;
  return {
    laps, miles, elapsedSec, lastLapSec, avgPace, lastPace, pace,
    goalMiles, remaining, etaSec, reached, lapMiles, splits,
  };
}

// Advance a projection by `elapsedSec` of real time at the athlete's
// pace — used to tick the map dots between feed updates.
export function advance(p, elapsedSec) {
  if (!p || p.pace == null || !(elapsedSec > 0)) return p;
  const miles = p.miles + elapsedSec / p.pace;
  return { ...p, miles, laps: Math.floor(miles / p.lapMiles) };
}

// Mark which entries are dimmed: when `focus` is non-empty, every entry
// whose bib is not in it is dimmed so the focused ones stand out.
export function markDim(entries, focus) {
  const set = new Set((focus || []).map(String));
  for (const e of entries || []) {
    e.dim = set.size > 0 && !set.has(String(e.bib));
  }
  return entries;
}

const COL = {
  axis: "#5a6b7a",
  grid: "rgba(120,140,160,0.18)",
  goal: "#46d17f",
  text: "#e8edf2",
  muted: "#9fb0bf",
};

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

// Distance-vs-time chart. `entries` is [{ p, label, color }].
export function drawChart(canvas, entries) {
  const { ctx, w, h } = fitCanvas(canvas);
  const padL = 54, padR = 18, padT = 16, padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const list = entries || [];

  const goal = list.length ? Math.max(...list.map((e) => e.p.goalMiles)) : 50;
  const maxMiles = list.reduce((m, e) => Math.max(m, e.p.miles), 0);
  const xMax = CHART_MAX_HOURS;
  const yMax = Math.max(goal, maxMiles, 1) * 1.12;

  const X = (hrs) => padL + (Math.max(0, Math.min(hrs, xMax)) / xMax) * plotW;
  const Y = (mi) => padT + plotH - (mi / yMax) * plotH;

  ctx.strokeStyle = COL.grid;
  ctx.fillStyle = COL.muted;
  ctx.font = "11px Segoe UI, sans-serif";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padT + (plotH / 5) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    ctx.fillText((yMax * (1 - i / 5)).toFixed(0) + " mi", 6, y + 4);
  }
  for (let hrs = 0; hrs <= 24; hrs += 3) {
    const x = X(hrs);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    ctx.fillText(hrs + "h", x - 7, h - 14);
  }

  ctx.strokeStyle = COL.axis;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // goal line
  ctx.strokeStyle = COL.goal;
  ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(padL, Y(goal)); ctx.lineTo(padL + plotW, Y(goal)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COL.goal;
  ctx.fillText("Goal " + goal + " mi", padL + plotW - 80, Y(goal) - 6);

  // Dimmed lines first so focused ones draw on top.
  const ordered = [...list].sort((a, b) => (a.dim ? 0 : 1) - (b.dim ? 0 : 1));
  for (const e of ordered) {
    const p = e.p;
    const splits =
      p.splits && p.splits.length > 1
        ? p.splits
        : [{ miles: 0, sec: 0 }, { miles: p.miles, sec: p.elapsedSec || 0 }];
    const last = splits[splits.length - 1];
    ctx.globalAlpha = e.dim ? 0.15 : 1;

    // actual lap-by-lap progression
    ctx.strokeStyle = e.color;
    ctx.lineWidth = e.dim ? 2 : 2.5;
    ctx.beginPath();
    splits.forEach((s, i) => {
      const x = X(s.sec / 3600);
      const y = Y(s.miles);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();

    // projection — a ray at the recent pace, clipped to the chart, so a
    // slow athlete's line visibly falls short of the goal in the window.
    if (!p.reached && p.pace) {
      const startH = last.sec / 3600;
      if (startH < CHART_MAX_HOURS) {
        const milesPerHour = 3600 / p.pace;
        const goalH = startH + (p.goalMiles - last.miles) / milesPerHour;
        const endH = Math.min(goalH, CHART_MAX_HOURS);
        const endMiles =
          goalH <= CHART_MAX_HOURS
            ? p.goalMiles
            : last.miles + (CHART_MAX_HOURS - startH) * milesPerHour;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(X(startH), Y(last.miles));
        ctx.lineTo(X(endH), Y(endMiles));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // a dot at each completed lap
    ctx.fillStyle = e.color;
    for (let i = 1; i < splits.length; i++) {
      ctx.beginPath();
      ctx.arc(X(splits[i].sec / 3600), Y(splits[i].miles), e.dim ? 2.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  if (list.length === 0) {
    ctx.fillStyle = COL.muted;
    ctx.font = "13px Segoe UI, sans-serif";
    ctx.fillText("No athletes selected", padL + 12, padT + plotH / 2);
  }
}

// Build an HTML legend for a set of chart/map entries.
export function chartLegend(entries) {
  const div = document.createElement("div");
  for (const e of entries || []) {
    const item = document.createElement("span");
    item.className = "legend-item";
    if (e.dim) item.style.opacity = "0.4";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.background = e.color;
    const label = document.createElement("span");
    label.textContent = e.label;
    item.append(sw, label);
    div.appendChild(item);
  }
  return div;
}
