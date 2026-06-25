#!/usr/bin/env python3
"""Composite 1080x1350 athlete cards.

Stage 2 of the athlete-card pipeline. For each transparent athlete PNG in
transparentFolder, stacks:
    [step-and-repeat background]
    [athlete cutout, contain-fit]
    [WTM and OCR Report logos, positioned per config]
    [optional rounded outer frame]
    [optional bib + name text from athletesCsv]

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

POSITIONS = {"top-left", "top-center", "top-right",
             "bottom-left", "bottom-center", "bottom-right"}


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
    if not csv_path.exists():
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
                "tag": (row.get("tag") or "").strip(),
            }
    return out


def load_font(name: str, size: int):
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
    scale = max(CARD_W / bg.width, CARD_H / bg.height)
    new_size = (int(bg.width * scale), int(bg.height * scale))
    bg = bg.resize(new_size, Image.LANCZOS)
    left = (bg.width - CARD_W) // 2
    top = (bg.height - CARD_H) // 2
    return bg.crop((left, top, left + CARD_W, top + CARD_H))


def fit_athlete(athlete: Image.Image, max_w: int, max_h: int) -> Image.Image:
    scale = min(max_w / athlete.width, max_h / athlete.height)
    new_size = (max(1, int(athlete.width * scale)),
                max(1, int(athlete.height * scale)))
    return athlete.resize(new_size, Image.LANCZOS)


def fit_logo(logo: Image.Image, max_w: int) -> Image.Image:
    if logo.width <= max_w:
        return logo
    scale = max_w / logo.width
    return logo.resize((max_w, int(logo.height * scale)), Image.LANCZOS)


def position_xy(size, position: str, margin: int):
    w, h = size
    if position not in POSITIONS:
        position = "top-left"
    vert, horiz = position.split("-")
    if horiz == "left":
        x = margin
    elif horiz == "right":
        x = CARD_W - margin - w
    else:
        x = (CARD_W - w) // 2
    if vert == "top":
        y = margin
    else:
        y = CARD_H - margin - h
    return x, y


def draw_outer_frame(card: Image.Image, color, width: int, inset: int):
    draw = ImageDraw.Draw(card)
    # Rounded rectangle for a slightly softer feel.
    radius = max(12, inset // 2)
    draw.rounded_rectangle(
        (inset, inset, CARD_W - inset, CARD_H - inset),
        radius=radius, outline=tuple(color), width=width,
    )


def fit_text(draw, box, text, font_name, max_size, fill, anchor="lm"):
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


def render_card(athlete_path: Path, bg_master: Image.Image, cfg: dict,
                logos: dict, meta: dict) -> Image.Image:
    card = bg_master.copy()

    # Athlete cutout — contain-fit into the safe area (leaves room for logos).
    with Image.open(athlete_path) as athlete:
        athlete = athlete.convert("RGBA")
        safe_h = int(CARD_H * 0.78)
        safe_w = int(CARD_W * 0.92)
        ath = fit_athlete(athlete, safe_w, safe_h)
        x = (CARD_W - ath.width) // 2
        # Anchor bottom of the athlete a little above the OCR logo line.
        y = int(CARD_H * 0.92) - ath.height
        card.paste(ath, (x, y), ath)

    # Logos on top.
    for key in ("wtm", "ocr"):
        logo = logos.get(key)
        if logo is None:
            continue
        pos = cfg.get(f"{key}LogoPosition", "top-left" if key == "wtm" else "bottom-right")
        margin = int(cfg.get(f"{key}LogoMargin", 60))
        x, y = position_xy(logo.size, pos, margin)
        card.alpha_composite(logo, dest=(x, y))

    # Optional outer frame.
    if cfg.get("outerFrame"):
        draw_outer_frame(card,
                         cfg.get("outerFrameColor", [240, 180, 0, 255]),
                         int(cfg.get("outerFrameWidth", 8)),
                         int(cfg.get("outerFrameInset", 28)))

    # Optional on-card text.
    if cfg.get("drawNameOnCard"):
        draw = ImageDraw.Draw(card)
        name = (meta.get("name") or "").upper()
        bib = meta.get("bib", "")
        # Sit just inside the outer frame.
        inset = int(cfg.get("outerFrameInset", 28)) + 40
        name_box = (inset, CARD_H - inset - 130, CARD_W - inset - 200, CARD_H - inset - 60)
        bib_box = (CARD_W - inset - 200, CARD_H - inset - 130, CARD_W - inset, CARD_H - inset - 60)
        fit_text(draw, name_box, name, "Anton-Regular.ttf", 80,
                 (255, 255, 255, 255), anchor="lm")
        fit_text(draw, bib_box, f"#{bib}", "Anton-Regular.ttf", 80,
                 tuple(cfg.get("outerFrameColor", [240, 180, 0, 255])),
                 anchor="rm")

    return card


def bib_of(name: str):
    m = BIB_RE.match(name)
    return m.group(1) if m else None


def maybe_load_logo(path_str, max_w):
    if not path_str:
        return None
    p = resolve(path_str)
    if not p.exists():
        return None
    logo = Image.open(p).convert("RGBA")
    return fit_logo(logo, int(max_w))


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

    for label, path in (("background", bg_path), ("transparent folder", src)):
        if not path.exists():
            print(f"{label} does not exist: {path}", file=sys.stderr)
            sys.exit(1)
    dst.mkdir(parents=True, exist_ok=True)

    logos = {
        "wtm": maybe_load_logo(cfg.get("wtmLogoPath"), cfg.get("wtmLogoMaxWidth", 320)),
        "ocr": maybe_load_logo(cfg.get("ocrLogoPath"), cfg.get("ocrLogoMaxWidth", 240)),
    }

    print(f"  input:      {src}")
    print(f"  output:     {dst}")
    print(f"  background: {bg_path}")
    print(f"  WTM logo:   {'loaded' if logos['wtm'] else '(missing — skipping)'}")
    print(f"  OCR logo:   {'loaded' if logos['ocr'] else '(missing — skipping)'}")
    print(f"  frame:      {'on' if cfg.get('outerFrame') else 'off'}")
    print(f"  name text:  {'on' if cfg.get('drawNameOnCard') else 'off'}")
    print()

    bg = prepare_background(bg_path)
    athletes = load_athletes(resolve(cfg.get("athletesCsv", "")))

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
            card = render_card(ath_path, bg, cfg, logos, meta)
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
