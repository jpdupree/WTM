#!/usr/bin/env python3
"""One-off card maker for named (non-bib) photos — crew, hosts, etc.

Unlike the main pipeline (strip-bg.py -> composite-cards.py, which key on a
leading bib and write a transparent PNG into the Athlete Photos folder),
this takes arbitrary image files, strips + composites them in a single
pass, and writes only the finished card. The transparent cutout is held in
memory and never saved — so these never land in the Athlete Photos folder
that feeds vMix solo-stats and the bib manifest.

Output filename = input stem + .png (so Carlo.JPG -> Carlo.png).

Setup:
    pip install rembg pillow onnxruntime

Usage:
    # explicit files -> cards folder from config
    python scripts/make-cards.py "D:\\path\\Carlo.JPG" "D:\\path\\Fran.JPG"

    # override the output folder
    python scripts/make-cards.py --out "D:\\some\\folder" "D:\\path\\Carlo.JPG"

    # whole folder of named photos
    python scripts/make-cards.py --in-folder "D:\\WTM\\Headshots\\WTM Headshots\\Capture"
"""

import argparse
import json
import sys
from pathlib import Path

try:
    from rembg import new_session, remove
    from PIL import Image
except ImportError as e:
    print(f"Missing dependency: {e}. Run: pip install rembg pillow onnxruntime",
          file=sys.stderr)
    sys.exit(1)

HERE = Path(__file__).resolve().parent
CFG_PATH = HERE / "photos-process-config.json"
CARD_W, CARD_H = 1080, 1350
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp"}


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
    bg = bg.resize((int(bg.width * scale), int(bg.height * scale)), Image.LANCZOS)
    left = (bg.width - CARD_W) // 2
    top = (bg.height - CARD_H) // 2
    return bg.crop((left, top, left + CARD_W, top + CARD_H))


def frame_athlete(cut: Image.Image) -> Image.Image:
    """Crop transparent padding, contain-fit, bottom-align on a 1080x1350 canvas."""
    bbox = cut.getbbox()
    if bbox:
        cut = cut.crop(bbox)
    if cut.width == 0 or cut.height == 0:
        return Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    scale = min(CARD_W / cut.width, CARD_H / cut.height)
    new_size = (max(1, int(cut.width * scale)), max(1, int(cut.height * scale)))
    cut = cut.resize(new_size, Image.LANCZOS)
    canvas = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    canvas.paste(cut, ((CARD_W - new_size[0]) // 2, CARD_H - new_size[1]), cut)
    return canvas


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", help="Image files to process.")
    ap.add_argument("--in-folder", default="", help="Process every image in this folder.")
    ap.add_argument("--out", default="", help="Output folder (defaults to cardsFolder in config).")
    ap.add_argument("--model", default=None, help="rembg model override (default from config).")
    ap.add_argument("--force", action="store_true", help="Overwrite existing output cards.")
    args = ap.parse_args()

    cfg = load_config()
    bg_path = resolve(cfg["backgroundPath"])
    fg_path = resolve(cfg.get("foregroundPath", ""))
    out_dir = Path(args.out) if args.out else Path(cfg["cardsFolder"])
    model = args.model or cfg.get("rembgModel") or "u2net"

    if not bg_path.exists():
        print(f"background not found: {bg_path}", file=sys.stderr)
        sys.exit(1)
    out_dir.mkdir(parents=True, exist_ok=True)

    inputs = [Path(f) for f in args.files]
    if args.in_folder:
        folder = Path(args.in_folder)
        inputs += [p for p in sorted(folder.iterdir())
                   if p.is_file() and p.suffix.lower() in IMG_EXT]
    inputs = [p for p in inputs if p.suffix.lower() in IMG_EXT]
    if not inputs:
        print("No input images given. Pass files or --in-folder.", file=sys.stderr)
        sys.exit(1)

    print(f"  background: {bg_path}")
    print(f"  foreground: {fg_path if fg_path.exists() else '(missing — bg + athlete only)'}")
    print(f"  output:     {out_dir}")
    print(f"  model:      {model}")
    print(f"  inputs:     {len(inputs)}")
    print()

    bg = prepare_background(bg_path)
    fg = Image.open(fg_path).convert("RGBA") if fg_path.exists() else None
    if fg is not None and fg.size != (CARD_W, CARD_H):
        fg = fg.resize((CARD_W, CARD_H), Image.LANCZOS)
    session = new_session(model_name=model)

    rendered = skipped = errored = 0
    for src in inputs:
        out_path = out_dir / (src.stem + ".png")
        if out_path.exists() and not args.force:
            skipped += 1
            continue
        try:
            with Image.open(src) as img:
                if img.mode not in {"RGB", "RGBA"}:
                    img = img.convert("RGBA")
                cut = remove(img, session=session)
                if cut.mode != "RGBA":
                    cut = cut.convert("RGBA")
                card = bg.copy()
                card.alpha_composite(frame_athlete(cut))
                if fg is not None:
                    card.alpha_composite(fg)
                card.save(out_path, "PNG", optimize=True)
            print(f"  ✓  {src.name}  ->  {out_path.name}")
            rendered += 1
        except Exception as exc:
            print(f"  !  {src.name}: {exc}", file=sys.stderr)
            errored += 1

    print()
    print(f"  rendered: {rendered}   skipped: {skipped}   errors: {errored}")


if __name__ == "__main__":
    main()
