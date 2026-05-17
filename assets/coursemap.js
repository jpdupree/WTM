// Leaflet course map shared by the map graphic and the commentator page.
// Draws the WTM lap on an OpenStreetMap base layer with obstacle markers
// and a movable set of athlete dots. Requires the Leaflet global `L`.

import { COURSE, OBSTACLES, LAP_MILES } from "./course-data.js";

// Interpolate [lat, lng] at a given mile along the lap.
function latLngAtMile(mile) {
  const last = COURSE[COURSE.length - 1];
  if (mile <= 0) return [COURSE[0].lat, COURSE[0].lng];
  if (mile >= last.mile) return [last.lat, last.lng];
  for (let i = 1; i < COURSE.length; i++) {
    if (COURSE[i].mile >= mile) {
      const a = COURSE[i - 1];
      const b = COURSE[i];
      const f = (mile - a.mile) / ((b.mile - a.mile) || 1);
      return [a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f];
    }
  }
  return [last.lat, last.lng];
}

export function createCourseMap(elId) {
  const map = L.map(elId);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const line = L.polyline(
    COURSE.map((p) => [p.lat, p.lng]),
    { color: "#f5a623", weight: 4, opacity: 0.9 },
  ).addTo(map);
  map.fitBounds(line.getBounds(), { padding: [22, 22] });

  for (const o of OBSTACLES) {
    L.circleMarker([o.lat, o.lng], {
      radius: 6, color: "#4ea3ff", weight: 2,
      fillColor: "#0c1014", fillOpacity: 1,
    })
      .addTo(map)
      .bindTooltip(`${o.n}. ${o.name}`, { direction: "top" });
  }

  L.circleMarker([COURSE[0].lat, COURSE[0].lng], {
    radius: 6, color: "#46d17f", weight: 2,
    fillColor: "#46d17f", fillOpacity: 1,
  })
    .addTo(map)
    .bindTooltip("Start / Finish", { direction: "top" });

  const athletes = L.layerGroup().addTo(map);

  // entries: [{ mile, label, color, dim }]
  function setAthletes(entries) {
    athletes.clearLayers();
    for (const e of entries || []) {
      const frac = ((e.mile % LAP_MILES) + LAP_MILES) % LAP_MILES;
      const dim = !!e.dim;
      const dot = L.circleMarker(latLngAtMile(frac), {
        radius: dim ? 6 : 9,
        color: "#1a1207",
        weight: 2,
        fillColor: e.color,
        fillOpacity: dim ? 0.3 : 1,
        opacity: dim ? 0.3 : 1,
      }).addTo(athletes);
      if (e.label && !dim) {
        dot.bindTooltip(String(e.label), {
          permanent: true, direction: "right", className: "athlete-tip",
        });
      }
    }
  }
  function clearAthletes() {
    athletes.clearLayers();
  }

  const refresh = () => map.invalidateSize();
  window.addEventListener("resize", refresh);
  setTimeout(refresh, 200);

  return { map, setAthletes, clearAthletes };
}
