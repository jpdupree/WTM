# Athlete photo pipeline

Two-stage pipeline that turns raw athlete photos into branded 1080×1350 IG cards.

```
SOURCE photos (jpg, varied backgrounds)
      │  strip-bg.py  (rembg)
      ▼
TRANSPARENT photos (PNG with alpha)
      │   ← also feeds vMix solo-stats via build-athlete-photos.mjs
      │  composite-cards.py  (Pillow)
      ▼
1080×1350 IG cards (PNG)
```

## One-time setup

1. **Install Python deps** on whichever machine will run this (the cloud
   machine is fine):
   ```powershell
   pip install rembg pillow onnxruntime
   ```
   The first `strip-bg.py` run downloads the rembg model (~170 MB for
   `u2net_human_seg`) to `~/.u2net/`. After that everything is offline.

2. **Copy the config**:
   ```powershell
   copy scripts\photos-process-config.example.json scripts\photos-process-config.json
   ```
   Edit the paths to match your Drive folders.

3. **Source-photo naming** — every input file must start with the bib so
   the pipeline can key on it: `56.jpg`, `56 Joseph Rucco.jpg`, etc.

## Running

```powershell
# Stage 1: backgrounds off
python scripts/strip-bg.py

# Stage 2: composite onto the branded template
python scripts/composite-cards.py
```

Both scripts are idempotent — re-running only processes files whose output
doesn't exist yet. Use `--force` to re-do everything, `--only 56,202,308`
to limit to specific bibs.

## Card layout

Output is `1080 × 1350` (IG portrait, 4:5). Layers, bottom to top:

1. **Background** — your step-and-repeat PNG, cover-fit and centred.
2. **Athlete cutout** — transparent PNG, contain-fit to ~85% of the card,
   anchored to the bottom-third so the head sits in the upper half.
3. **Foreground frame** — branded overlay (transparent in the centre,
   solid info bar at the bottom).
4. **Text** — name, bib, and either a story tag or country, drawn from
   `athletesCsv`.

The text geometry in `composite-cards.py` (`NAME_BOX`, `TAG_BOX`,
`BIB_BOX`) assumes the bottom-info-bar frame design. If we switch to a
different frame, those constants move with it.

## Foreground frame asset

The branded frame is a 1080×1350 transparent PNG at the path set in
`foregroundPath` (default `assets/cards/foreground.png`, repo-tracked).
If the file is missing, the script still composites background + athlete
+ text, just without the branded overlay — so you can run it before the
final art lands.
