# WTM 2026 → next year: reset & lessons

Everything you need to bring the broadcast dashboard back up for the next
World's Toughest Mudder, plus the hard-won gotchas from 2026 so you don't
rediscover them live. Read alongside `RACE-DAY.md` (the step-by-step
runbook) — this file is the "what changes year to year" layer.

---

## 1. Rabbit cameras — cellular bonding in the UK countryside

The bonded-cellular streaming (Speedify software bonding) struggled at
Belvoir because both paths rode the same physical network. The fix is to
put each bonded connection on a **different carrier**.

**The multi-network rule** — use different physical networks, never two
SIMs on the same carrier:

- **Phone:** keep on **EE** (widest overall geographic footprint in rural UK).
- **Hotspot:** put a **Vodafone** SIM in it (strongest second-place network
  for UK rural coverage).
- **Alternative:** if Vodafone is weak at the specific site, use **O2**
  instead. **Avoid Three** for this — traditionally the weakest rural
  footprint of the major UK providers.

**Speedify settings when bonding mixed SIMs:**

- **Transport Mode → UDP.** Speedify defaults can choke on the high latency
  / packet loss of physical bonding; UDP handles jitter and loss far better
  during a live stream than TCP.
- **Connection priorities → both "Primary."** Set both the Wi-Fi (hotspot)
  and the Cellular (phone) to Primary so Speedify splits video packets
  evenly across both paths simultaneously (rather than one as backup).

**Also carried over from 2026 rabbit setup** (see `RACE-DAY.md` §5):
- Each camera's **Location toggle** in Larix Tuner must be **Enabled**
  per-device — this is the #1 reason a camera doesn't show on the map.
- Set the device **description** in Tuner — that's the map label.
- The camera reports position without an active video stream; it does NOT
  need to be streaming for the GPS dot to appear.
- Larix API budget at 60s polling with 4 cameras is ~48% of the 15k quota —
  plenty of headroom.

---

## 2. Point everything at the new event

The 2026 RaceResult event was **406834**. Next year there's a new event id
and new feed URLs. Repoint **all four** places (they drift apart if you miss
one — that bit us in 2026):

1. **`RACE_FEED_OVERALL`** GitHub Actions secret (Settings → Secrets and
   variables → Actions) — the OCRReportall feed.
2. **`RACE_FEED_TEAMS`** GitHub Actions secret — the team-standings feed.
3. **`scripts/feed-config.json`** on the cloud machine — `overallFeedUrl`
   and `teamFeedUrl`. **Must match the two secrets exactly** — in 2026 the
   secret pointed at a stale feed while the poller was correct, and phantom
   athletes showed up from the fallback file.
4. **Re-enable the GitHub Action** (Actions → "Fetch WTM results" → ··· →
   Enable workflow) — it was disabled post-event.

The public results link on the Hub + Athlete Tracker also hardcodes the
event id (`my.raceresult.com/406834/`) — update it.

### Feed field-name gotchas (2026)

The 2026 feed differed from prior years — expect to re-verify these:

- **Solo athletes were NOT labeled `Category === "Individual"`.** The
  men/women slices in `scripts/build-slices.mjs` now key off sex and only
  *exclude* rows whose Category reads team/relay, and accept `Gender` as a
  fallback for `Sex`. Robust, but sanity-check a feed row.
- **`AgeGroup` is an internal category number, not a placing.** Age-group
  podiums in `assets/app.js` sort by `Rank`, not `AgeGroup` (sorting on the
  latter shuffled an 80-mile runner below a 35-mile one).
- Grab one live feed row early and confirm field names: `Distance`, `Laps`,
  `TotalTime`, `LastLapTime`, `FirstLap`…`TwentyfifthLap`, `LastSeenTOD`,
  `Sex`/`Gender`, `Category`, `AgeGroupCategory`.

---

## 3. Cloud machine services

Installed as WinSW services under **your user account** (not LocalSystem —
LocalSystem can't see the `G:` Drive mount, which broke the video bridge in
2026). They were set to **Manual** start post-event so they don't fire
against dead feeds all year.

Bring them back:
```powershell
# flip back to automatic
sc config WTM-Results     start= auto
sc config WTM-Rabbit      start= auto
sc config WTM-VideoBridge start= auto
# and start now
cd E:\WTM\services
.\WTM-Results.exe start
.\WTM-Rabbit.exe start
.\WTM-VideoBridge.exe start
```
(Note the space after `start=` — `sc` quirk.)

- Confirm the **Log On** account is still your user (services.msc → each
  service → Log On tab) — needed for the `G:` Drive mount.
- Switch Drive-for-Desktop to **Mirror files** mode before the event so
  clips physically live on disk and survive sign-out (streaming mode files
  vanish when the session ends).

---

## 4. Course (KMZ → map)

When TM sends the new course KMZ (it's a zipped KML — unzip to get `doc.kml`):

```bash
node scripts/build-course.mjs \
  --input <path-to-doc.kml> \
  --output assets/course-data-2026.js \
  --lap-miles 5
```

- `--lap-miles 5` sets the **official** lap length (WTM scores each lap as a
  flat 5.0 mi regardless of the GPS-measured ~5.01). It rescales all
  per-point / per-obstacle miles to official miles so map + feed agree.
- Obstacle names are read straight from the KML placemark names (numbered
  "1. Low Rig" etc.) — no hardcoded list to maintain.
- `commentator.js`, `rabbit.js`, `graphic-map.js`, `graphic-chart.js` all
  import `course-data-2026.js`. Either overwrite that file (rename the
  `--output`) or repoint the imports.
- The 2026 course ran the **opposite direction** with new obstacles vs 2025
  — don't assume continuity.

**Map projection timezone:** `assets/predict.js` `secondsSinceSeen()`
hardcodes **`Europe/London`** for the "time since last mat crossing"
calc that spreads dots around the loop. Correct for Belvoir; change if the
event ever moves.

---

## 5. Athlete photos & cards

Full pipeline in `scripts/PHOTOS.md`. Quick version:

1. Drop source photos (bib-first filenames, e.g. `1006.jpg`) into the
   **Athlete Photos Source** Drive folder.
2. `python scripts/strip-bg.py` → transparent 1080×1350 cutouts into
   **Athlete Photos** (also feeds vMix solo-stats).
   - **Use `rembgModel: u2net`, not `u2net_human_seg`** — human_seg deletes
     held objects (cut Austin Azar's ice cream out in 2026). `u2net` keeps them.
3. `python scripts/composite-cards.py` → branded IG cards into **Athlete Cards**
   (uses `templates/WTMOCRsteprepeat.png` + `templates/foreground.png`).
4. `node scripts/make-photo-blanks.mjs "<Athlete Photos folder>"` → 1×1
   transparent placeholder for every roster bib without a photo (sources bibs
   from `data/athlete-bibs.json`, regenerate that from the new participant list).
5. `node scripts/build-athlete-photos.mjs` → `data/athlete-photos.json`
   manifest (bib → Drive fileId) for solo-stats. Commit it.

- Crew/host cards (no bib): `python scripts/make-cards.py <files>` — writes
  only to the cards folder, never the Athlete Photos folder. `--scale` and
  `--anchor` control framing.
- Drive thumbnail endpoint may flatten PNG transparency onto white — test
  one before relying on it for solo-stats.

---

## 6. Participant list & storylines

- Parse the exported XLSX (sections: Pit Crew / Individual / Team Relay /
  Brunch). Filter to numeric bibs — transponder strings (`ZHC…`,
  14-digit ids) leak into the bib column.
- **Bibs change between exports** — the early list had Azar at 15, the final
  at 1006. Don't lock graphics to bibs until the final roster.
- Watch for **duplicate registrations** (two solo rows, one blank bib) —
  2026 had Sean Merryweather and Stefanie Dressel. Flag to TM timing.
- Storyline picks with no bib on the final list may have withdrawn or moved
  to relay — verify before building a graphic around them.

---

## 7. Website / Hub

- Hub cards live in WordPress Custom HTML blocks; the repo copy is
  `hub-info-cards.html` (source of truth). Update the event links: results,
  course map, venue/pit map, racer info pack, brunch tickets, community
  events, course preview video.
- **Social wall** (`assets/social.js`): Instagram keeps shortening its
  "Never miss a post" login-modal delay. The two-iframe swap interval
  (`REFRESH_MS`, 9s in 2026) has to stay under it — drop to 6–7s if the
  modal reappears. Longer-term: switch to screenshotting posts.
- Header is the **Newspaper (tagDiv)** theme — desktop and **mobile headers
  are set separately**, and Cloud Library templates override the theme-panel
  logo settings.

---

## 8. Git workflow note

The scheduled results Action commits to `main` every ~10 min during the
event, so local pushes get rejected constantly (non-fast-forward). Just
`git pull --rebase origin main` and re-push — it's not a conflict, just the
bot racing you. The bot's own commits show as "unverified" on GitHub; leave
them, don't rewrite shared history to fix a cosmetic label.
