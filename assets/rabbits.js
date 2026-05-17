// A camera ("rabbit") position is dropped from the maps once its last
// fix is this old, so a camera that has gone offline doesn't linger.
const RABBIT_STALE_MS = 15 * 60 * 1000;

// Convert the raw /rabbits object into an array of valid, fresh cameras.
export function rabbitList(obj) {
  const now = Date.now();
  return Object.values(obj || {}).filter((r) => {
    if (!r || typeof r.lat !== "number" || typeof r.lng !== "number") return false;
    const t = Date.parse(r.at);
    return !Number.isFinite(t) || now - t < RABBIT_STALE_MS;
  });
}
