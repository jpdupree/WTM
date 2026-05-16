# WTM — World's Toughest Mudder 2026 Leaderboards

A static dashboard showing **Top 10 leaderboards** for World's Toughest
Mudder 2026, built for the live-stream crew. A scheduled GitHub Action
pulls the RaceResult feeds and commits a JSON snapshot the dashboard reads.

```
GitHub Action (every 10 min)
  └─ fetches the 4 RaceResult feeds → commits data/results.json
        └─ GitHub Pages serves index.html, which reads data/results.json
```

This avoids CORS and keeps the API key URLs out of the browser.

## Files

| Path | Purpose |
|------|---------|
| `index.html`, `assets/` | The dashboard (static, no build step) |
| `data/results.json` | Latest snapshot, written by the Action |
| `scripts/fetch-results.mjs` | Fetches the feeds and writes the snapshot |
| `.github/workflows/fetch-results.yml` | Scheduled fetch + commit |

## Setup

### 1. Add the feed URLs as Actions secrets

Settings → Secrets and variables → Actions → **New repository secret**.
Add each of these with the matching RaceResult API URL as the value:

- `RACE_FEED_OVERALL`
- `RACE_FEED_MEN`
- `RACE_FEED_WOMEN`
- `RACE_FEED_TEAMS`

The URLs live only in secrets — never in the repo or the published site.
A slice whose secret is missing is simply skipped.

### 2. Enable GitHub Pages

Settings → Pages → Source: **Deploy from a branch** →
Branch: `claude/wtm-dashboard-yyvRB` (or `main` once merged) → `/ (root)`.

The site publishes at `https://<user>.github.io/wtm/`.

> Pages sites are publicly reachable even from a private repo — which is
> what you want, since vMix's browser input can't authenticate. Nothing
> sensitive is exposed: only the committed results JSON is public.

### 3. Run the Action

Actions tab → **Fetch WTM results** → **Run workflow** to fetch
immediately. After that it runs every 10 minutes on its own.

For race weekend you can tighten the `cron` in
`.github/workflows/fetch-results.yml` (minimum interval GitHub allows is
5 minutes).

## Local preview

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

To preview with real data, run the fetch script with the env vars set:

```sh
RACE_FEED_OVERALL='https://...' node scripts/fetch-results.mjs
```

## Leaderboards

Tabs: **Overall, Men, Women, Teams** (Top 10 each, by RaceResult rank)
and **Age Groups** (Top 10 within each `Category` from the overall feed).
The page auto-refreshes every 30 seconds.
