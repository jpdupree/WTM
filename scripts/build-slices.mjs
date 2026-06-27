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
  // Some feeds label the field Sex, others Gender; values may be m/f or
  // male/female. Normalise both.
  const sex = (r) => String(r.Sex ?? r.Gender ?? "").trim().toLowerCase();
  const isMan = (r) => sex(r) === "m" || sex(r) === "male";
  const isWoman = (r) => sex(r) === "f" || sex(r) === "female";
  // Treat anyone not explicitly flagged as a team/relay entry as an
  // individual — don't require Category to equal a specific string, since
  // the feed's solo label varies year to year ("Individual", "Solo", or
  // absent entirely). Only exclude rows whose Category clearly reads team.
  const isTeam = (r) => /team|relay/i.test(String(r.Category ?? ""));
  const teams = teamRows
    ? [...teamRows].sort(byRank)
    : subset(sorted, isTeam);
  return {
    overall: sorted,
    men: subset(sorted, (r) => !isTeam(r) && isMan(r)),
    women: subset(sorted, (r) => !isTeam(r) && isWoman(r)),
    teams,
  };
}
