# WTM Dashboard

Live race dashboard for World's Toughest Mudder. Pulls JSON from a Race Result
endpoint, shows a sortable team dashboard, and exposes transparent overlay
views for vMix / OBS browser sources.

## Setup

```bash
npm install
cp .env.example .env.local
# edit .env.local — fill in RACE_RESULTS_URL and (optionally) NEXT_PUBLIC_TEAM_BIBS
npm run dev
```

Open http://localhost:3000

## Routes

| Route | Use |
|---|---|
| `/` | Full dashboard — sortable, searchable, filter by category. Highlights tracked team bibs. |
| `/team` | Team-focused cards. Add bibs inline or via `?bibs=1234,5678`. |
| `/overlay/leaderboard` | Transparent top-N leaderboard for streaming. `?top=5&cat=Individual` supported. |
| `/overlay/team` | Transparent team-only widget. `?bibs=1234,5678` supported. |
| `/overlay/runner/<bib>` | Single-runner card overlay. |
| `/api/results` | Cached JSON proxy of the upstream feed. |

All `/overlay/*` routes have a transparent body — drop the URL into vMix as a
**Web Browser** input or OBS as a **Browser Source**, set the size, and the page
will render with a transparent background.

### vMix tips

- Width 1280 / Height 720 for full-HD overlays at 50% scale, or 1920×1080 native.
- Refresh interval is handled in-page (15s on overlays, 30s on dashboard) — no
  need to set vMix to reload the URL.
- For a compact lower-third leaderboard, try
  `/overlay/leaderboard?top=5` at 720×400.

## Configuration

`.env.local` (server-only and public):

```
RACE_RESULTS_URL=https://api.raceresult.com/348237/A5N5KM8EQMU8KDTHK2HLZGTQ2YLGT5NM
NEXT_PUBLIC_TEAM_BIBS=2374,2003
RACE_CACHE_SECONDS=15
```

The server caches the upstream response for `RACE_CACHE_SECONDS` so 100 viewers
don't hammer the race-results host.

If `RACE_RESULTS_URL` is unset or upstream errors, `/api/results` falls back to
`data/sample.json` and tags the payload `source: "sample"` so you can see it in
the dashboard footer.

## Deploy

Easiest: push to GitHub and import on [Vercel](https://vercel.com/new). Set the
two env vars in the project's settings. The deployed URL goes straight into
vMix.

## Data shape

Upstream returns a flat JSON array of records. Each record:

```ts
{
  Rank, Bib, Name, Category,           // "Individual" | "Team"
  Gender, Nation, AgeGroup,
  Distance,  Laps,                      // strings, numeric
  LastLapTime, LastSeen, LastSeenTOD,
  TotalTime
}
```

`/api/results` enriches each row with parsed numeric fields (`laps`,
`distanceMiles`, `totalTimeSec`, `lastLapSec`, `avgLapSec`).
