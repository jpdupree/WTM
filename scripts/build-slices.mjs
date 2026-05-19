// Shared results-feed helpers, used by both the scheduled GitHub Action
// (fetch-results.mjs) and the live race-day poller (results-poll.mjs)
// so the two can never drift apart in how they shape the data.

export const byRank = (a, b) =>
  (parseFloat(a.Rank) || 1e9) - (parseFloat(b.Rank) || 1e9);

// A gender/category subset, re-ranked 1..N (overall rank kept as Overall).
function subset(rows, predicate) {
  return rows
    .filter(predicate)
    .sort(byRank)
    .map((r, i) => ({ ...r, Overall: r.Rank, Rank: i + 1 }));
}

export async function fetchFeed(url) {
  const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("expected a JSON array");
  return data;
}

// Build the { overall, men, women, teams } slices. `teamRows` is the
// dedicated team-standings feed; pass null to fall back to deriving
// teams from the overall feed (which only lists individual members).
export function buildSlices(overall, teamRows) {
  const sorted = [...overall].sort(byRank);
  const sex = (r) => String(r.Sex).toLowerCase();
  const teams = teamRows
    ? [...teamRows].sort(byRank)
    : subset(sorted, (r) => r.Category === "Team");
  return {
    overall: sorted,
    men: subset(sorted, (r) => r.Category === "Individual" && sex(r) === "m"),
    women: subset(sorted, (r) => r.Category === "Individual" && sex(r) === "f"),
    teams,
  };
}
