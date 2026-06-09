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
| `video-admin.html` | Video-submissions control (pick a clip to show) |
| `video.html` | Video-submissions on-air output (vMix browser input) |
| `assets/video-config.js` | **You fill this in** — published response-sheet CSV URL |
| `scripts/vmix-video-poll.mjs` | Loads the picked clip into a vMix input (run on the vMix PC) |
| `assets/course-data.js` | Generated lap geometry + obstacles |
| `data/course.kml`, `scripts/build-course.mjs` | Course KML → `course-data.js` |
| `data/results.json` | Latest feed snapshot, written by the Action |
| `data/bios.csv` | Pre-event participant survey export — drives the solo-stats bio block |
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
   {
     "rules": {
       "control": { ".read": true, ".write": true },
       "rabbits": { ".read": true, ".write": true },
       "social": { ".read": true, ".write": true },
       "video-submissions": { ".read": true, ".write": true }
     }
   }
   ```
   vMix and the graphics read without logging in, so read must be public.
   `control` carries commentator state; `rabbits` carries camera GPS
   (Larix Tuner poller); `social` carries the curated Instagram posts;
   `video-submissions` carries the video-form entries.

## Social wall

A curated Instagram wall — no API or Meta app review needed. A crew
member opens `social-admin.html`, pastes the links of good `#wtm2026`
posts, and `social.html` (a vMix Web Browser input) cycles through
them. Only posts that are added show; remove any with the ×.

## Video submissions

Racers upload clips through the **World's Toughest Mudder Video Submission
Form**. `video-admin.html` lists every submission so a show runner can
preview them and click **Show on air**; `video.html` (a vMix Web Browser
input) plays the chosen clip. The control and output sync through Firebase
just like the social wall — submissions live at `/video-submissions`, the
on-air pick at `/control/videoSubmission`.

The admin page pulls submissions automatically from the form's response
sheet. One-time setup:

1. **Link the form to a sheet:** open the form → **Responses** tab → click
   the green Sheets icon → link or create the response spreadsheet.
2. **Share the sheet:** in the spreadsheet, **Share → Anyone with the link →
   Viewer**. (No "Publish to web" step needed — the page reads the shared
   sheet directly via its gviz endpoint.)
3. **Point the page at it:** paste the sheet's share URL into `VIDEO_SHEET`
   in `assets/video-config.js` (poll interval is `VIDEO_POLL_SECONDS`,
   default 30s).
4. **Make the clips playable:** Form-uploaded files are private by default.
   In Drive, open the form's **"… (File responses)" folder → Share → Anyone
   with the link → Viewer**, so the embedded player works on the public
   on-air page.
5. **Add the Firebase rule** for `video-submissions` (see step 3 of Setup).

The admin page finds the upload column by which cells actually contain Drive
links, and reads name, caption (description), timestamp, and
landscape/portrait by header — so the exact form questions don't have to
match a fixed schema, and portrait clips are framed 9:16 on air. A show
runner can also paste a Drive video link to add one by hand, and the ×
hides anything you don't want to air.

If a browser ever blocks the gviz fetch (CORS), do **File → Share → Publish
to web → CSV** on the sheet and put that `…/pub?…output=csv` URL in
`VIDEO_SHEET_CSV_URL` (it overrides `VIDEO_SHEET`).

### Playing a clip as a real vMix input

`video.html` plays Drive's embedded player in a browser input — fine for a
quick look, but for broadcast-quality playback (clean audio, scrubbing) you
want the actual file in a vMix Media input. vMix can't pull a file into an
input from a Data Source or title, so a small bridge does it:
`scripts/vmix-video-poll.mjs` watches the picked clip and loads the local
Google-Drive-for-Desktop copy into a vMix **VideoList** input via the vMix
API. Run it on the vMix PC, alongside the other pollers.

1. **In vMix:** add an empty **List / VideoList** input named exactly
   `Submission Clip` (or change `vmixInput` in the config). Settings → Web
   Controller → enable it and note the port (default 8088). Optionally set
   the input to play from the start when taken to program.
2. **Google API key:** in Google Cloud, enable the **Drive API** and create
   an **API key** (the submission files are shared "anyone with the link",
   so a key alone resolves their filenames — no OAuth).
3. **Config:** copy `scripts/vmix-config.example.json` to
   `scripts/vmix-config.json` (git-ignored) and fill in `driveApiKey`, the
   local `responsesFolder` (the form's "… (File responses)" subfolder that
   holds the videos), `vmixApi`, and `vmixInput`.
4. **Run it (Node 18+):** `node scripts/vmix-video-poll.mjs` — leave it
   running. Each time the crew clicks **Show on air**, the clip lands in the
   `Submission Clip` input; just cut to that input.

The bridge maps the dashboard's Drive file id to the local filename via the
Drive API (Drive-for-Desktop mirrors the exact name). If two uploads share a
filename, Drive may suffix the local copy (e.g. ` (1)`), which would need a
manual fix — rare at 100 MB clip sizes.

## Athlete race photos

`commentator.html` shows the athlete's race photo at the top of the
"From the athlete" panel — keyed by **bib**, so it shows up even for
racers who didn't fill in the pre-event survey. The photo comes from a
Drive folder whose files start with the bib number (e.g. `1136.jpg`),
mapped via `data/athlete-photos.json`.

One-time setup:

1. **Share the folder** "Anyone with the link → Viewer" — required so the
   browser can fetch thumbnails without authentication.
2. **Reuse your Drive API key** from the vMix-bridge setup (the same key
   works; just make sure the Drive API is enabled on its project).
3. **Config:** copy `scripts/photos-config.example.json` to
   `scripts/photos-config.json` (git-ignored), set `driveApiKey` and
   `folderId` (the part after `/folders/` in the Drive URL).
4. **Generate / refresh the manifest:**
   `node scripts/build-athlete-photos.mjs` — outputs
   `data/athlete-photos.json`. Re-run any time photos are added or
   replaced, then commit and push.

If a bib has no entry in the manifest, the commentator page falls back to
the survey-uploaded photo (if any) and renders nothing if neither exists.

## Camera GPS (Larix Tuner)

Camera operators stream with Larix Broadcaster; their GPS is read from
the Larix Tuner API and mirrored into Firebase `/rabbits`, where every
map picks it up. The poller is a standalone script — run it on an
always-on machine whose public IP is whitelisted in Larix Tuner:

1. In Larix Tuner: enable the API (Account → API setup), copy the
   Client ID, generate an API key, and whitelist the machine's IP.
2. Copy `scripts/larix-credentials.example.json` to
   `scripts/larix-credentials.json` and fill in `clientId` / `apiKey`
   (this file is git-ignored — never commit it).
3. **For each camera's device in Tuner:** set its **description** to the
   map name ("Cam 1", …), enable **remote control**, and in the
   remote-control panel turn on **Location information → Enabled**.
   Without that last toggle, Tuner returns no GPS for the device.
4. On each phone: Larix Premium active, with location permission granted.
5. Run it (Node 18+): `node scripts/rabbit-poll.mjs` — leave it running.
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
  Underneath the stats, a **"From the athlete"** block shows the
  participant's pre-event survey answers (country, goal, fun fact,
  favorite/toughest obstacle, photo link, etc.) so commentators have
  something to talk about.
- **News Ticker** — one item per line; *Update Ticker* pushes to the bar.
- **Prediction** — pick an athlete and mileage goal; previews the chart
  and drives the map + chart graphics.

### Refreshing the bio data

The bio block is fed by `data/bios.csv`, an export of the pre-event
participant survey. To update it:

1. Open the form's response sheet → **File → Download → Comma-separated
   values (.csv)**.
2. Replace `data/bios.csv` with the new file (keep that exact filename).
3. Commit and push. The commentator page picks it up on next load.

Names are matched on **Full Name**, tolerating middle names ("Anne Clifford"
↔ "Anne Carolyn Clifford") and common nicknames ("Chris" ↔ "Christopher").

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
