#!/usr/bin/env python3
"""Composite 1080x1350 athlete cards from transparent photos + branded template.

Stage 2 of the athlete-card pipeline. For each transparent athlete PNG in
transparentFolder, stacks:
    [step-and-repeat background]
    [athlete cutout, fit to 1080x1350]
    [branded foreground frame]
    [name / bib / nation text drawn from athletesCsv]

Output: a 1080x1350 PNG per bib in cardsFolder, ready for IG portrait posts.

Setup (one time):
    pip install pillow

Usage:
    python scripts/composite-cards.py
    python scripts/composite-cards.py --force            # re-render everything
    python scripts/composite-cards.py --only 56,202,308  # only specific bibs
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as e:
    print(f"Missing dependency: {e}. Run: pip install pillow", file=sys.stderr)
    sys.exit(1)

HERE = Path(__file__).resolve().parent
CFG_PATH = HERE / "photos-process-config.json"

CARD_W, CARD_H = 1080, 1350
BIB_RE = re.compile(r"^(\d+)")

# Text geometry — overridden by the foreground frame's slots. Defaults
# assume a bottom info bar; tweak alongside the frame design.
NAME_BOX = (60, 1175, 900, 1240)     # left, top, right, bottom
TAG_BOX = (60, 1245, 900, 1290)
BIB_BOX = (920, 1175, 1020, 1300)

WHITE = (255, 255, 255, 255)
ACCENT = (240, 180, 0, 255)          # OCR Report gold
MUTED = (207, 214, 221, 255)


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


def load_athletes(csv_path: Path):
    """bib -> {name, nation, ag, tag} from a CSV with those columns."""
    if not csv_path.exists():
        print(f"  warn: athletes CSV not found at {csv_path} — cards will lack on-card text")
        return {}
    out = {}
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            bib = (row.get("bib") or row.get("Bib") or "").strip()
            if not bib:
                continue
            out[bib] = {
                "name": (row.get("name") or row.get("Name") or "").strip(),
                "nation": (row.get("nation") or row.get("Nation") or "").strip(),
                "ag": (row.get("ag") or row.get("AgeGroup") or "").strip(),
                "tag": (row.get("tag") or "").strip(),
            }
    return out


def load_font(name: str, size: int):
    """Try a few likely paths so the script runs cross-platform."""
    fonts_dir = HERE.parent / "assets" / "cards" / "fonts"
    for path in (fonts_dir / name, Path("C:/Windows/Fonts") / name, Path("/Library/Fonts") / name):
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                pass
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default()


def prepare_background(bg_path: Path) -> Image.Image:
    bg = Image.open(bg_path).convert("RGBA")
    # Cover-fit (preserve aspect, fill the whole card, crop overflow).
    scale = max(CARD_W / bg.width, CARD_H / bg.height)
    new_size = (int(bg.width * scale), int(bg.height * scale))
    bg = bg.resize(new_size, Image.LANCZOS)
    left = (bg.width - CARD_W) // 2
    top = (bg.height - CARD_H) // 2
    return bg.crop((left, top, left + CARD_W, top + CARD_H))


def fit_athlete(athlete: Image.Image, max_w: int, max_h: int) -> Image.Image:
    """Contain-fit the athlete into max_w x max_h, preserving aspect."""
    scale = min(max_w / athlete.width, max_h / athlete.height)
    if scale < 1:
        return athlete.resize((int(athlete.width * scale), int(athlete.height * scale)), Image.LANCZOS)
    return athlete


def fit_text(draw, box, text, font_name, max_size, fill, anchor="lm"):
    """Render text inside box, shrinking the font until it fits."""
    if not text:
        return
    left, top, right, bottom = box
    max_w = right - left
    size = max_size
    while size > 12:
        font = load_font(font_name, size)
        bbox = draw.textbbox((0, 0), text, font=font)
        if bbox[2] - bbox[0] <= max_w and bbox[3] - bbox[1] <= (bottom - top):
            break
        size -= 4
    x = left if anchor.startswith("l") else right if anchor.startswith("r") else (left + right) // 2
    y = (top + bottom) // 2
    draw.text((x, y), text, font=font, fill=fill, anchor=anchor)


def render_card(athlete_path: Path, bg_master: Image.Image, fg: Image.Image,
                meta: dict) -> Image.Image:
    card = bg_master.copy()

    # Athlete cutout — fit to ~85% of the card (leave room for the bottom bar).
    with Image.open(athlete_path) as athlete:
        athlete = athlete.convert("RGBA")
        ath = fit_athlete(athlete, int(CARD_W * 0.9), int(CARD_H * 0.85))
        x = (CARD_W - ath.width) // 2
        y = max(0, int(CARD_H * 0.78) - ath.height)
        card.paste(ath, (x, y), ath)

    # Branded frame on top.
    if fg is not None:
        card.alpha_composite(fg)

    # On-card text.
    draw = ImageDraw.Draw(card)
    fit_text(draw, NAME_BOX, meta.get("name", "").upper(),
             "Anton-Regular.ttf", 80, WHITE, anchor="lm")
    if meta.get("tag"):
        fit_text(draw, TAG_BOX, meta["tag"].upper(),
                 "Inter-Bold.ttf", 28, ACCENT, anchor="lm")
    elif meta.get("nation"):
        fit_text(draw, TAG_BOX, meta["nation"],
                 "Inter-Regular.ttf", 28, MUTED, anchor="lm")
    bib = meta.get("bib")
    if bib:
        fit_text(draw, BIB_BOX, f"#{bib}",
                 "Anton-Regular.ttf", 80, ACCENT, anchor="rm")

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
    fg_path = resolve(cfg["foregroundPath"])
    csv_path = resolve(cfg["athletesCsv"])

    for label, path in (("background", bg_path), ("transparent folder", src)):
        if not path.exists():
            print(f"{label} does not exist: {path}", file=sys.stderr)
            sys.exit(1)
    dst.mkdir(parents=True, exist_ok=True)

    print(f"  input:      {src}")
    print(f"  output:     {dst}")
    print(f"  background: {bg_path}")
    print(f"  foreground: {fg_path if fg_path.exists() else '(missing — skipping branded frame)'}")
    print()

    bg = prepare_background(bg_path)
    fg = Image.open(fg_path).convert("RGBA") if fg_path.exists() else None
    if fg is not None and fg.size != (CARD_W, CARD_H):
        fg = fg.resize((CARD_W, CARD_H), Image.LANCZOS)
    athletes = load_athletes(csv_path)

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

        meta = dict(athletes.get(bib, {}))
        meta["bib"] = bib

        try:
            card = render_card(ath_path, bg, fg, meta)
            card.save(out_path, "PNG", optimize=True)
            print(f"  ✓  {bib:>4}  {meta.get('name', '')}  ->  {out_name}")
            rendered += 1
        except Exception as exc:
            print(f"  !  {bib:>4}  {ath_path.name}: {exc}", file=sys.stderr)
            errored += 1

    print()
    print(f"  rendered: {rendered}   skipped (already done): {skipped}   "
          f"no-bib: {no_bib}   errors: {errored}")


if __name__ == "__main__":
    main()
