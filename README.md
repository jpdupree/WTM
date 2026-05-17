# WTM — World's Toughest Mudder 2026

Static GitHub Pages site for the WTM 2026 live-stream crew. Three things:

1. **Leaderboards** (`index.html`) — Top 10 boards for the crew.
2. **Commentator control** (`commentator.html`) — picks the athlete for the
   vMix solo-stats title, edits the news ticker, and drives the prediction
   graphics.
3. **vMix graphics** (`graphics/`) — the predictive map and goal chart,
   loaded as vMix Web Browser inputs.

## Architecture

```
GitHub Action (every 10 min)
  └─ fetches the 4 RaceResult feeds → commits data/results.json
        └─ GitHub Pages serves all pages, which read data/results.json

Commentator page ──writes──▶ Firebase Realtime DB ──read──▶ vMix
  • selected athlete            /control/athlete         Data Source → solo-stats title
  • news ticker text            /control/news            Data Source → news bar title
  • prediction athlete + goal   /control/prediction      map.html + chart.html browser inputs
```

The committed `data/results.json` keeps the API keys out of the browser
and avoids CORS. Firebase carries the *live control* state that a static
site can't hold on its own.

## Files

| Path | Purpose |
|------|---------|
| `index.html` | Top 10 leaderboards |
| `commentator.html` | Commentator control surface |
| `graphics/map.html`, `graphics/chart.html` | vMix browser-input graphics |
| `assets/firebase-config.js` | **You fill this in** — Firebase web config |
| `assets/links.js` | **You fill this in** — vMix social / telestrator links |
| `assets/course-data.js` | Generated lap geometry + obstacles |
| `data/course.kml`, `scripts/build-course.mjs` | Course KML → `course-data.js` |
| `data/results.json` | Latest feed snapshot, written by the Action |
| `scripts/fetch-results.mjs` | Fetches the feeds |
| `.github/workflows/fetch-results.yml` | Scheduled fetch + commit |

## Setup

### 1. Enable GitHub Pages

Settings → Pages → Source: **Deploy from a branch** →
Branch: `claude/wtm-dashboard-yyvRB` (or `main` once merged) → `/ (root)`.
The site publishes at `https://<user>.github.io/WTM/`.

> Pages sites are publicly reachable even from a private repo — which is
> what you want, since vMix's browser input can't authenticate. Nothing
> sensitive is exposed: API keys live only in Actions secrets, and the
> committed JSON is just public race results.

### 2. Add the feed URL as an Actions secret

Settings → Secrets and variables → Actions → **New repository secret**.
Add one secret:

`RACE_FEED_OVERALL` — the RaceResult API URL for the enriched
`OCRReportall` report (every athlete). The men/women/teams slices are
derived from it, so no other feed secrets are needed.

The feed must return the enriched fields — `Sex` (`m`/`f`),
`AgeGroupCategory` (e.g. `Male 50-54`), and the per-lap split times
`FirstLap`…`TwentyfifthLap` — or the age-group, gender, and lap-dot
features stay inert.

Then: Actions tab → **Fetch WTM results** → **Run workflow** to populate
`data/results.json`; after that it runs every 10 minutes. For the 2026
race, just update `RACE_FEED_OVERALL` to the 2026 event's URL — no code
change. `data/sample-results-2025.json` is kept as an offline fixture.

### 3. Set up Firebase (live control state)

1. Create a free project at <https://console.firebase.google.com>.
2. Build → **Realtime Database** → Create database.
3. Set its rules to (crew tool — open read/write, no sensitive data):
   ```json
   { "rules": { "control": { ".read": true, ".write": true } } }
   ```
   vMix and the graphics read without logging in, so read must be public.
4. Project settings → **Your apps** → add a **Web app** → copy the config
   values into `assets/firebase-config.js` (these values are *not* secret).

Until this is done, every page runs in **preview mode** — fully usable,
but selections won't reach vMix.

### 4. Wire up vMix

**Solo-stats title & news bar — Data Sources (JSON):**
Add a Data Source of type JSON pointing at the Firebase REST endpoints
(your `databaseURL` from the config + path + `.json`):

- Solo stats: `https://<your-db>.firebasedatabase.app/control/athlete.json`
  → fields: `Name`, `Bib`, `Rank`, `Laps`, `Distance`, `TotalTime`,
  `LastLapTime`, `Category`, `Nation`.
- News bar: `https://<your-db>.firebasedatabase.app/control/news.json`
  → bind the `text` field.

> If your vMix version's Data Sources can't read JSON, tell me — I'll have
> the Action also publish XML/CSV versions.

**Map & chart — Web Browser inputs:**
Add Web Browser inputs pointing at your published pages:

- `https://<user>.github.io/WTM/graphics/map.html`
- `https://<user>.github.io/WTM/graphics/chart.html`

The map is a zoomable Leaflet / OpenStreetMap view of the course; the
chart projects pace to a mileage goal over a fixed 25.5-hour window.
Both follow the commentator's prediction live and accept one or many
athletes. To pin them manually, append `?bibs=123,456&goal=75` (or a
single `?bib=123`) to the URL.

## Commentator page

- **Solo Stats** — search by name or bib; the pick drives the vMix title
  and refreshes itself as the race updates. *Clear* blanks the graphic.
- **News Ticker** — one item per line; *Update Ticker* pushes to the bar.
- **Prediction** — pick an athlete and mileage goal; previews the chart
  and drives the map + chart graphics.

## Course data

`assets/course-data.js` is generated from `data/course.kml` (the WTM
course KMZ, unzipped) by `scripts/build-course.mjs` — it holds the lap
geometry and the 20 obstacle mileages, snapped onto the loop. Re-run
after replacing the KML:

```sh
node scripts/build-course.mjs
```

`TIMING_MATS` is still empty — send the timing-mat locations to add them
(a re-run of the script resets the array).

## Local preview

```sh
python3 -m http.server 8080
# open http://localhost:8080  and  /commentator.html
```

Preview a graphic with no Firebase:
`http://localhost:8080/graphics/chart.html?bibs=123,456&goal=75`

To pull real data locally:

```sh
RACE_FEED_OVERALL='https://...' node scripts/fetch-results.mjs
```
