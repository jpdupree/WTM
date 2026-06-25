# Athlete photo pipeline

Two-stage pipeline that turns raw athlete photos into transparent-background
PNGs (for vMix titles) and 1080×1350 branded IG cards.

```
SOURCE photos (jpg, varied backgrounds)
      │  strip-bg.py  (rembg)
      ▼
TRANSPARENT photos (PNG with alpha)
      │   ← vMix solo-stats title uses these directly,
      │     pulling name/bib/etc from a Data Source.
      │
      │  composite-cards.py  (Pillow)
      ▼
1080×1350 IG cards (PNG)
   (step-and-repeat bg + athlete + WTM logo + OCR logo + optional frame)
```

## One-time setup

1. **Install Python deps** on whichever machine will run this:
   ```powershell
   pip install rembg pillow onnxruntime
   ```
   First `strip-bg.py` run downloads the rembg model (~170 MB) to
   `~/.u2net/`. After that it's offline.

2. **Copy the config**:
   ```powershell
   copy scripts\photos-process-config.example.json scripts\photos-process-config.json
   ```
   Edit the paths and toggles.

3. **Source-photo naming** — every input file must start with the bib so the
   pipeline can key on it: `56.jpg`, `56 Joseph Rucco.jpg`, etc.

## Running

```powershell
# Stage 1: backgrounds off — output is what vMix wants
python scripts/strip-bg.py

# Stage 2: composite IG cards (background + athlete + branding)
python scripts/composite-cards.py
```

Both scripts are idempotent — re-running only processes files whose output
doesn't exist yet. Flags:

- `--force` — re-process / re-render everything.
- `--only 56,202,308` — restrict to specific bibs.
- `--model birefnet-portrait` (`strip-bg.py` only) — override the rembg model.

## Card layout (1080×1350)

Layers, bottom to top:

1. **Background** — your step-and-repeat PNG, cover-fit to the canvas.
2. **Athlete cutout** — transparent PNG, contain-fit to ~78% of canvas
   height, anchored low so the head sits in the upper half.
3. **Logos** — WTM and OCR Report logos, positioned per
   `wtmLogoPosition` / `ocrLogoPosition` in the config (any of
   `top-left | top-center | top-right | bottom-left | bottom-center |
   bottom-right`). Missing files are skipped silently.
4. **Outer frame** — optional rounded border at `outerFrameInset` px from
   the edge, drawn in `outerFrameColor`.
5. **Text** — optional bib + name in the bottom area; off by default since
   IG captions usually carry that.

## vMix solo-stats use

The transparent PNGs in `transparentFolder` double as the vMix solo-stats
source. The existing `build-athlete-photos.mjs` scans that folder, picks
up the bib from each filename, and writes `data/athlete-photos.json` —
the runtime manifest the browser reads. No extra step needed beyond
running `strip-bg.py`.

## Tweaking the look

Most of the IG card is config-driven. The script reads
`photos-process-config.json` on every run:

- Change logo positions or max widths via the `*LogoPosition` /
  `*LogoMaxWidth` keys.
- Toggle the outer frame, recolour it, or change its inset.
- Flip `drawNameOnCard` to `true` to bake the bib + name into the image.

Bigger layout changes (text position, athlete crop, frame shape) live in
`render_card()` in `composite-cards.py`.
