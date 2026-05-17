// Preset camera-operator ("rabbit") slots for GPS tracking. Edit this
// list to match your camera positions — each operator picks their slot
// on rabbit.html. The array index is the slot's id in Firebase.

export const RABBIT_SLOTS = [
  "Cam 1",
  "Cam 2",
  "Cam 3",
  "Cam 4",
  "Cam 5",
  "Cam 6",
];

// A rabbit's last fix is dropped from the maps once it is this old, so a
// camera that has gone offline doesn't linger forever.
const RABBIT_STALE_MS = 15 * 60 * 1000;

// Convert the raw /rabbits object into an array of valid, fresh rabbits.
export function rabbitList(obj) {
  const now = Date.now();
  return Object.values(obj || {}).filter((r) => {
    if (!r || typeof r.lat !== "number" || typeof r.lng !== "number") return false;
    const t = Date.parse(r.at);
    return !Number.isFinite(t) || now - t < RABBIT_STALE_MS;
  });
}
