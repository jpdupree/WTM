#!/usr/bin/env python3
"""Composite 1080x1350 athlete cards from background + athlete + foreground.

Stage 2 of the athlete-card pipeline. For each transparent athlete PNG in
transparentFolder, stacks three layers:

    [step-and-repeat background, cover-fit to 1080x1350]
    [athlete cutout — already 1080x1350, bottom-aligned by strip-bg.py]
    [foreground overlay PNG — banner + branding, transparent above]

Output: a 1080x1350 PNG per bib in cardsFolder, ready for IG portrait posts.

The foreground PNG owns every branded element (banner shape, gradient,
text, accent rules, frame). Tweak the design by re-exporting it from
Photoshop — no code changes needed.

Setup (one time):
    pip install pillow

Usage:
    python scripts/composite-cards.py
    python scripts/composite-cards.py --force            # re-render everything
    python scripts/composite-cards.py --only 56,202,308  # only specific bibs
"""

import argparse
import json
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError as e:
    print(f"Missing dependency: {e}. Run: pip install pillow", file=sys.stderr)
    sys.exit(1)

HERE = Path(__file__).resolve().parent
CFG_PATH = HERE / "photos-process-config.json"

CARD_W, CARD_H = 1080, 1350
BIB_RE = re.compile(r"^(\d+)")


def load_config():
    if not CFG_PATH.exists():
        print(f"Missing {CFG_PATH}. Copy photos-process-config.example.json to "
              f"photos-process-config.json and fill in the paths.", file=sys.stderr)
        sys.exit(1)
    with open(CFG_PATH) as f:
        return json.load(f)


def resolve(cfg_path: str) -> Path:
    p = Path(cfg_path)
    return p if p.is_absolute() else (HERE / cfg_path).resolve()


def prepare_background(bg_path: Path) -> Image.Image:
    bg = Image.open(bg_path).convert("RGBA")
    scale = max(CARD_W / bg.width, CARD_H / bg.height)
    new_size = (int(bg.width * scale), int(bg.height * scale))
    bg = bg.resize(new_size, Image.LANCZOS)
    left = (bg.width - CARD_W) // 2
    top = (bg.height - CARD_H) // 2
    return bg.crop((left, top, left + CARD_W, top + CARD_H))


def fit_athlete_to_canvas(ath: Image.Image) -> Image.Image:
    """Backwards-compat: if a transparent athlete PNG isn't already 1080x1350
    (e.g. legacy strip-bg output), crop the alpha bbox and bottom-align it."""
    bbox = ath.getbbox()
    if bbox:
        ath = ath.crop(bbox)
    if ath.width == 0 or ath.height == 0:
        return Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    scale = min(CARD_W / ath.width, CARD_H / ath.height)
    new_size = (max(1, int(ath.width * scale)), max(1, int(ath.height * scale)))
    ath = ath.resize(new_size, Image.LANCZOS)
    canvas = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    canvas.paste(ath, ((CARD_W - new_size[0]) // 2, CARD_H - new_size[1]), ath)
    return canvas


def render_card(athlete_path: Path, bg_master: Image.Image,
                fg: Image.Image | None) -> Image.Image:
    card = bg_master.copy()
    ath = Image.open(athlete_path).convert("RGBA")
    if ath.size != (CARD_W, CARD_H):
        ath = fit_athlete_to_canvas(ath)
    card.alpha_composite(ath)
    if fg is not None:
        card.alpha_composite(fg)
    return card


def bib_of(name: str):
    m = BIB_RE.match(name)
    return m.group(1) if m else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true",
                    help="Re-render cards even if the output exists.")
    ap.add_argument("--only", default="",
                    help="Comma-separated list of bib numbers to process.")
    args = ap.parse_args()

    cfg = load_config()
    src = Path(cfg["transparentFolder"])
    dst = Path(cfg["cardsFolder"])
    bg_path = resolve(cfg["backgroundPath"])
    fg_path = resolve(cfg.get("foregroundPath", ""))

    for label, path in (("background", bg_path), ("transparent folder", src)):
        if not path.exists():
            print(f"{label} does not exist: {path}", file=sys.stderr)
            sys.exit(1)
    dst.mkdir(parents=True, exist_ok=True)

    fg = None
    if fg_path.exists():
        fg = Image.open(fg_path).convert("RGBA")
        if fg.size != (CARD_W, CARD_H):
            fg = fg.resize((CARD_W, CARD_H), Image.LANCZOS)

    print(f"  input:      {src}")
    print(f"  output:     {dst}")
    print(f"  background: {bg_path}")
    print(f"  foreground: {fg_path if fg is not None else '(missing — background + athlete only)'}")
    print()

    bg = prepare_background(bg_path)

    only = {b.strip() for b in args.only.split(",") if b.strip()}
    candidates = [p for p in sorted(src.iterdir())
                  if p.is_file() and p.suffix.lower() == ".png"]

    rendered = skipped = no_bib = errored = 0
    for ath_path in candidates:
        bib = bib_of(ath_path.name)
        if not bib:
            no_bib += 1
            continue
        if only and bib not in only:
            continue

        out_name = ath_path.stem + ".png"
        out_path = dst / out_name
        if out_path.exists() and not args.force:
            skipped += 1
            continue

        try:
            card = render_card(ath_path, bg, fg)
            card.save(out_path, "PNG", optimize=True)
            print(f"  ✓  {bib:>4}  ->  {out_name}")
            rendered += 1
        except Exception as exc:
            print(f"  !  {bib:>4}  {ath_path.name}: {exc}", file=sys.stderr)
            errored += 1

    print()
    print(f"  rendered: {rendered}   skipped (already done): {skipped}   "
          f"no-bib: {no_bib}   errors: {errored}")


if __name__ == "__main__":
    main()
