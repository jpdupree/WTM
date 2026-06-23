# WTM 2026 — Race Day Runbook

Step-by-step to bring the dashboard, graphics, camera GPS, and video
submissions live. The **Before race day** sections are pre-event prep;
sections 1–7 are race day.

## Before race day — move the pollers to the AWS machine

Testing runs on a personal machine; for the event two pollers must run
on the always-on AWS / vMix machine — the **camera-GPS poller** and the
**live results poller**. (Everything else — the dashboard, Firebase, the
pages — is cloud-hosted and needs nothing on that machine.)

- [ ] Give the AWS instance a **static Elastic IP** (free while the
      instance is running) so its outbound IP never changes.
- [ ] Whitelist that Elastic IP in Larix Tuner → Account → API setup.
- [ ] On the AWS machine: install **Node 18+** and `git clone` this repo.
- [ ] Create `scripts/larix-credentials.json` there with the Tuner
      `clientId` / `apiKey`.
- [ ] Create `scripts/feed-config.json` there with the RaceResult
      `overallFeedUrl` / `teamFeedUrl` (copy from
      `feed-config.example.json`).
- [ ] Test once: `node scripts/rabbit-poll.mjs` — it should list devices
      with no `403`.
- [ ] Test once: `node scripts/results-poll.mjs` — it should print
      `pushed N athletes`.
- [ ] Make both **auto-start and stay running** so a reboot can't kill
      them (Windows scheduled task at logon, or NSSM as a service). Ask
      Claude to set this up if needed.
- [ ] Stop the test pollers on the personal machine.

## Before race day — video submissions

The submission wall (`video-admin.html` curator → `video.html` on-air output
+ a vMix bridge that loads the local clip into a real input) needs four
things in place: a Firebase rule, two Drive shares, and a small poller on
the vMix machine.

- [ ] Firebase Realtime DB rules include
      `"video-submissions": { ".read": true, ".write": true }` (alongside
      `control`, `rabbits`, `social`, `results`).
- [ ] The form's response sheet is shared **Anyone with the link → Viewer**,
      and `VIDEO_SHEET` in `assets/video-config.js` points at it.
- [ ] The form's **"… (File responses)" folder** in Drive is shared
      **Anyone with the link → Viewer** so the clips can play on air.
- [ ] On the vMix PC, Drive-for-Desktop is signed in and that folder shows
      under `G:\My Drive\…`. Right-click the folder → **Available offline**
      so the first cut doesn't stutter while a file materialises.
- [ ] On the vMix PC: `git pull`, then copy
      `scripts/vmix-config.example.json` to `scripts/vmix-config.json` and
      fill in `driveApiKey`, the `responsesFolder` path, `vmixApi`, and
      `vmixInput`.
- [ ] In vMix: add an empty **List / VideoList** input named exactly
      `Submission Clip` (or whatever you set `vmixInput` to). Web Controller
      enabled; note the port (default 8088).
- [ ] Test the bridge: `node scripts/vmix-video-poll.mjs --test <fileId>` —
      expect four `[ok]` lines (vMix reachable, Drive filename, local file
      exists, load command sent).
- [ ] Auto-start the bridge alongside the other pollers.

## Before race day — submission URL & QR

- [ ] **`theocrreport.com/submit`** redirects to the form (Pretty Links 301
      on WordPress, or LightningBase NGINX redirect — `.htaccess` doesn't
      work on LB). Test from a private window.
- [ ] Scan the submit **QR code** from a phone — must land on the form.
      Drop the URL + QR onto a broadcast slate / lower-third, race emails,
      and on-site signage.
- [ ] Submit overlay graphic exists as a vMix title — confirm it's in the
      show project and looks right against the video.

## Before race day — athlete bios

The solo-stats "From the athlete" block is fed by `data/bios.csv` (an export
of the pre-event participant survey), matched to athletes by **Full Name**.

- [ ] When the final 2026 entrant list + survey responses are in, export the
      response sheet to CSV and replace `data/bios.csv` (keep the filename),
      then commit and push.
- [ ] **Reconcile names against the live athlete feed** — once
      `data/results.json` holds the real 2026 field, have Claude cross-check
      every bio name against every athlete name and report:
      - bios that match **no** athlete (typo, withdrawn, or name format diff)
      - bios that match **more than one** athlete (ambiguous — needs a bib)
      Fix at the source (or add a bib column to the survey) so every bio
      lands on exactly one athlete.

## Before race day — commentator mute button

A dedicated Stream Deck key (driven by Central Control) handles self-mute.
Central Control toggles vMix `AudioOff/AudioOn` on the commentator's
input/bus and binds the key's icon/colour to the **actual mute state** —
not just the press — so it self-corrects if mute changes elsewhere.

- [ ] Map the key in Central Control and bench-test from both directions:
      press the key, then mute from the vMix UI — the key must follow.
- [ ] Convention: **red icon = muted** ("they can't hear you").

## Before race day — dress rehearsal (T-1)

End-to-end run of the full broadcast stack on the production machine.

- [ ] All three pollers running and logging cleanly:
      `results-poll.mjs`, `rabbit-poll.mjs`, `vmix-video-poll.mjs`. Each
      set to relaunch on reboot.
- [ ] Submit a test clip via `theocrreport.com/submit` → appears on
      `video-admin.html` within ~30s → **Load into vMix** → clip lands in
      the `Submission Clip` input → cut to it on air → confirm 9:16
      framing and audio path.
- [ ] Mark that test submission **Viewed** and confirm the unviewed badge
      on `commentator.html` ticks down.
- [ ] Press the mute button, then also toggle mute from the vMix UI —
      the LED tracks state both directions.
- [ ] Open every page in a **private window** (the GitHub Pages CDN can
      lag): leaderboard, commentator, social-admin, video-admin, map
      graphic, chart graphic.

## Production machine — software to start

Launch these on the production machine when starting the broadcast.
This list grows — more items will be added as they come up.

- [ ] Start **SRTMiniServer**
- [ ] Start **vMix Social**
- [ ] Start the **Show Start Timer** script in vMix

## 1. Results feed

- [ ] Update the `RACE_FEED_OVERALL` GitHub Actions secret to the 2026
      event's enriched (`OCRReportall`) feed URL. The feed must include
      `Sex`, `AgeGroupCategory`, the per-lap `FirstLap`…`TwentyfifthLap`
      splits, and the `Pit1`…`Pit25` pit times.
- [ ] Update the `RACE_FEED_TEAMS` GitHub Actions secret to the 2026
      event's team-standings feed URL — one row per team, with the team
      name in `Name` and the combined `Laps` / `Distance`. Without it
      the Teams tab falls back to listing individual team members.
- [ ] (Optional) Tighten the schedule in
      `.github/workflows/fetch-results.yml` — `*/5 * * * *` for every
      5 minutes (GitHub's minimum interval).
- [ ] Actions tab → **Fetch WTM results** → **Run workflow** to pull
      results immediately. The run log should show `fetched N rows`.
- [ ] Once the feed is live, fill the athlete-photo gaps so the
      solo-stats graphic clears properly for athletes with no photo:
      `node scripts/make-photo-blanks.mjs "<Athlete Photos folder>"`
      (creates a transparent placeholder for every bib without a photo;
      never overwrites real photos).

The GitHub Action above is the **fallback** — it refreshes results every
5–10 minutes. For near-real-time standings during the broadcast the
**live results poller** (section 4) takes over; the pages switch to its
feed automatically the moment it starts publishing.

## 2. Pages (GitHub Pages)

| Page | URL |
|------|-----|
| Leaderboards | https://jpdupree.github.io/WTM/ |
| Commentator control | https://jpdupree.github.io/WTM/commentator.html |
| Map graphic | https://jpdupree.github.io/WTM/graphics/map.html |
| Chart graphic | https://jpdupree.github.io/WTM/graphics/chart.html |
| Rabbit viewer | https://jpdupree.github.io/WTM/rabbit.html |

## 3. vMix

- [ ] Data Source (JSON) → solo-stats title:
      `https://wtm-broadcast-default-rtdb.firebaseio.com/control/athlete.json`
- [ ] Data Source (JSON) → news bar:
      `https://wtm-broadcast-default-rtdb.firebaseio.com/control/news.json`
- [ ] Web Browser input → `…/graphics/map.html` (append `?rabbits=1`
      to show the cameras)
- [ ] Web Browser input → `…/graphics/chart.html`
- [ ] Web Browser input → `…/social.html` (curated Instagram wall)
- [ ] A crew member curates the wall from `…/social-admin.html`
- [ ] Web Browser input → `…/video.html` (the picked video submission, 9:16)
- [ ] **List / VideoList** input named `Submission Clip` — the vMix bridge
      loads the chosen clip into this; cut to it on air.
- [ ] A crew member curates submissions from `…/video-admin.html`;
      `commentator.html` shows a red badge with the unviewed count.

## 4. Live results poller

For near-real-time standings, `results-poll.mjs` runs on the AWS / vMix
machine and pushes the RaceResult feeds to Firebase every 20s — the
pages pick up each change within seconds. The GitHub Action (section 1)
stays on as the fallback if this poller stops.

- [ ] Machine has Node 18+ and a copy of this repo (`git pull` for latest).
- [ ] `scripts/feed-config.json` exists with `overallFeedUrl` and
      `teamFeedUrl` (copy from `feed-config.example.json`).
- [ ] Start the poller: `node scripts/results-poll.mjs` — leave the
      window open. Lines like `pushed 659 athletes, 16 teams` mean it's
      live.

## 5. Camera GPS — Larix Tuner poller

The poller runs on the AWS / vMix machine and must stay running for the
whole event.

- [ ] Machine has Node 18+ and a copy of this repo (`git pull` for latest).
- [ ] `scripts/larix-credentials.json` exists with the Tuner `clientId`
      and `apiKey` (copy from `larix-credentials.example.json`).
- [ ] The machine's public IP — use a **static Elastic IP** — is
      whitelisted in Larix Tuner → Account → API setup.
- [ ] For each camera's device in Larix Tuner, open the device and, in order:
  1. **Set the description** — this is the label that shows up on the map
     ("Cam 1", "Finish Line", …). Easy to skip; do it right after opening
     the camera.
  2. Enable **remote control**.
  3. **Location information → Enabled** in the remote-control panel — the
     toggle that clears the "Getting location is OFF" error.
- [ ] Each phone: Larix Premium active, OS location permission granted.
- [ ] Start the poller: `node scripts/rabbit-poll.mjs` — leave the
      window open. Lines like `+ Cam 1: 52.89…, -0.77…` mean it's live.

> The camera reports its position as soon as the three Tuner steps above are
> set — it does **not** need to be actively streaming video
> (`active_session=false` in the log is fine).

> **New Larix Tuner account?** Nothing in the dashboard code changes.
> Just enable the API on the new account, put the new `clientId` /
> `apiKey` into `scripts/larix-credentials.json`, re-whitelist the
> machine's IP, and redo the per-device setup above.

## 6. vMix video bridge

`vmix-video-poll.mjs` runs on the vMix machine alongside the other
pollers. When the crew clicks **Load into vMix** on `video-admin.html` it
resolves the clip's Drive filename and loads the local Drive-for-Desktop
copy into the `Submission Clip` VideoList input — you cut to that input.

- [ ] Machine has Node 18+ and a copy of this repo (`git pull` for latest).
- [ ] `scripts/vmix-config.json` exists with `driveApiKey`,
      `responsesFolder`, `vmixApi`, and `vmixInput` (copy from
      `vmix-config.example.json`).
- [ ] In vMix, the `Submission Clip` **List / VideoList** input exists and
      is empty; the Web Controller is enabled on the port in `vmixApi`.
- [ ] Start the bridge: `node scripts/vmix-video-poll.mjs` — leave the
      window open. Lines like `loaded into "Submission Clip": <name>` mean
      it's live.

> If a clip won't load, run
> `node scripts/vmix-video-poll.mjs --test <fileId>` for a per-layer
> ok/FAIL readout (vMix reachable, Drive filename, local file, load).

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Leaderboard not updating live | The results poller isn't running — start `node scripts/results-poll.mjs` on the AWS machine. Until then the pages fall back to the 5–10 min GitHub Action. |
| Camera poller `HTTP 403` | The machine's IP isn't whitelisted — check its current public IP and update the Tuner whitelist. |
| `geo_granted=false` | Grant Larix the OS location permission on that phone (Settings → app permissions) and make sure location sharing is on in the app. |
| `no location … "Getting location is OFF"` | Turn on **Location information → Enabled** in that device's Tuner remote-control panel. A live video stream is **not** required. |
| Wrong or blank camera name on the map | Set the device **description** in Larix Tuner — that's the map label. |
| Camera missing from a map | Confirm the poller window shows a `+` line for it; check the map's Rabbits toggle is on. |
| Pages show old content | Hard-refresh or use a private window; the GitHub Pages CDN can lag 1–2 min after a push. |
| Commentator banner is orange | Firebase not connected — check `assets/firebase-config.js`. |
| `video-admin.html` shows "Couldn't read the sheet" | The browser blocked the gviz fetch (CORS) or the sheet isn't shared. Re-check sharing, or set `VIDEO_SHEET_CSV_URL` to a `…/pub?…output=csv` from File → Share → Publish to web — it overrides `VIDEO_SHEET`. |
| New submissions aren't appearing on `video-admin.html` | Check the poll-status line under the filter row, the sheet's share setting, and the `video-submissions` Firebase rule. |
| Bridge logs `HTTP 403 — …` | Drive API isn't enabled on the key's project, or the key has an API/application restriction blocking it. Enable Drive API and set restrictions to allow it. |
| Bridge logs `fetch failed` | vMix Web Controller is off, or `vmixApi` host/port is wrong. Open `http://<host>:<port>/api/` in a browser on the vMix PC — it should return XML. |
| Bridge logs `local file not found` | `responsesFolder` doesn't match, or Drive-for-Desktop hasn't synced the file yet. Verify the path; if the file has the same name as an earlier one, Drive may have suffixed it `(1)`. |
| First clip stutters on cut | The folder is in Drive-for-Desktop streaming mode. Right-click the `(File responses)` folder → **Available offline**. |
| Mute LED stuck or out of sync with vMix | Central Control's feedback binding has dropped — restart Central Control's connection to vMix, then re-toggle mute once to resync. |
