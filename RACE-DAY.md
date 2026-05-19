# WTM 2026 — Race Day Runbook

Step-by-step to bring the dashboard, graphics, and camera GPS live. The
"Before race day" section is pre-event prep; sections 1–6 are race day.

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
- [ ] For each camera's device in Larix Tuner:
  - description = the camera's map name ("Cam 1", …)
  - remote control enabled
  - **Location information → Enabled** in the remote-control panel
- [ ] Each phone: Larix Premium active, location permission granted.
- [ ] Start the poller: `node scripts/rabbit-poll.mjs` — leave the
      window open. Lines like `+ Cam 1: 52.89…, -0.77…` mean it's live.

> **New Larix Tuner account?** Nothing in the dashboard code changes.
> Just enable the API on the new account, put the new `clientId` /
> `apiKey` into `scripts/larix-credentials.json`, re-whitelist the
> machine's IP, and redo the per-device setup above.

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Leaderboard not updating live | The results poller isn't running — start `node scripts/results-poll.mjs` on the AWS machine. Until then the pages fall back to the 5–10 min GitHub Action. |
| Camera poller `HTTP 403` | The machine's IP isn't whitelisted — check its current public IP and update the Tuner whitelist. |
| `geo_granted=false` | Enable remote control for that device in Tuner. |
| `no location (status=error)` | Turn on **Location information → Enabled** in that device's remote-control panel. |
| Camera missing from a map | Confirm the poller window shows a `+` line for it; check the map's Rabbits toggle is on. |
| Pages show old content | Hard-refresh or use a private window; the GitHub Pages CDN can lag 1–2 min after a push. |
| Commentator banner is orange | Firebase not connected — check `assets/firebase-config.js`. |
