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
| `/overlay/leaderboard` | Transparent top-N leaderboard. `?feed=overall\|men\|women\|teams&top=10` |
| `/overlay/podium` | Big broadcast-style top-N with gap-to-leader. `?feed=women&top=10` |
| `/overlay/team` | Transparent team-only widget. `?bibs=1234,5678` supported. |
| `/overlay/runner/<bib>` | Single-runner card overlay. |
| `/api/results?feed=overall\|men\|women\|teams` | Cached JSON proxy of the upstream feed. |

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
RACE_FEED_OVERALL=https://api.raceresult.com/.../overall
RACE_FEED_MEN=https://api.raceresult.com/.../men
RACE_FEED_WOMEN=https://api.raceresult.com/.../women
RACE_FEED_TEAMS=https://api.raceresult.com/.../teams
NEXT_PUBLIC_TEAM_BIBS=2374,2003
RACE_CACHE_SECONDS=15
```

The server caches each upstream response for `RACE_CACHE_SECONDS` so 100 viewers
don't hammer the race-results host.

If a feed env var is unset or upstream errors, `/api/results` falls back to
`data/sample.json` and tags the payload `source: "sample"`.

## Deploy (Vercel, GitHub-integrated)

Goal: a permanent public URL that vMix and your phone both load. Nothing runs
on your laptop or AWS box besides vMix itself.

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Import the `jpdupree/WTM` repo. Vercel auto-detects Next.js — leave the
   build settings on their defaults.
3. Open **Environment Variables** and paste the feed URLs from
   `.env.example`:
   - `RACE_FEED_OVERALL`
   - `RACE_FEED_MEN`
   - `RACE_FEED_WOMEN`
   - `RACE_FEED_TEAMS`
   - `NEXT_PUBLIC_TEAM_BIBS` (comma-separated bib numbers)
   - `RACE_CACHE_SECONDS` (optional; default 15)
4. Click **Deploy**. After ~30 seconds you'll have a URL like
   `https://wtm-xxxxx.vercel.app`. Every push to `main` (or your tracked
   branch) auto-redeploys.

In vMix, add a **Web Browser** input pointing to e.g.
`https://your-url.vercel.app/overlay/podium?feed=women&top=10`.

To rotate API URLs mid-event without redeploying, edit the env vars in the
Vercel project settings and click **Redeploy** — takes ~30s.

## Data shape

Upstream returns a flat JSON array of records. Each record:

```ts
{
  Rank, Bib, Name,
  Category?,            // "Individual" | "Team" — only on overall feed
  Overall?,             // overall position — only on segment feeds
  Gender, Nation, AgeGroup,
  Distance, Laps,                      // strings, numeric
  LastLapTime, LastSeen, LastSeenTOD,
  TotalTime,
  Diff?                 // gap to leader, e.g. "-10" miles — segment feeds only
}
```

`/api/results` enriches each row with parsed numeric fields (`laps`,
`distanceMiles`, `totalTimeSec`, `lastLapSec`, `avgLapSec`, `diffMiles`).
