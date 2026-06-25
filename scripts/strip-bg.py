#!/usr/bin/env python3
"""Strip backgrounds off athlete source photos using rembg.

Stage 1 of the athlete-card pipeline. Reads source photos with backgrounds,
writes transparent-background PNGs into the configured Drive folder. Idempotent
— skips files whose output already exists (use --force to re-process).

Output filenames preserve the leading bib from the source name and switch to
.png so the alpha channel survives:
    56.jpg                  -> 56.png
    56 Joseph Rucco.jpg     -> 56 Joseph Rucco.png

Setup (one time):
    pip install rembg pillow onnxruntime

The first run downloads the rembg model (~170MB for u2net_human_seg) into
~/.u2net/. After that it runs offline.

Usage:
    python scripts/strip-bg.py
    python scripts/strip-bg.py --force            # re-process everything
    python scripts/strip-bg.py --only 56,202,308  # only specific bibs
"""

import argparse
import json
import re
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
BIB_RE = re.compile(r"^(\d+)")

# Final card dimensions — strip-bg.py outputs at this size so the athlete
# slots straight into the composite without further sizing.
CARD_W, CARD_H = 1080, 1350


def frame_for_card(cut):
    """Crop transparent padding, then place the athlete on a 1080x1350
    transparent canvas, contain-fit and bottom-aligned. The bottom of the
    athlete lands at the bottom of the canvas so the foreground banner
    sits over their legs, not over empty space."""
    bbox = cut.getbbox()
    if bbox:
        cut = cut.crop(bbox)
    if cut.width == 0 or cut.height == 0:
        return Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    scale = min(CARD_W / cut.width, CARD_H / cut.height)
    new_size = (max(1, int(cut.width * scale)), max(1, int(cut.height * scale)))
    cut = cut.resize(new_size, Image.LANCZOS)
    canvas = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    x = (CARD_W - new_size[0]) // 2
    y = CARD_H - new_size[1]
    canvas.paste(cut, (x, y), cut)
    return canvas


def load_config():
    if not CFG_PATH.exists():
        print(f"Missing {CFG_PATH}. Copy photos-process-config.example.json to "
              f"photos-process-config.json and fill in the paths.",
              file=sys.stderr)
        sys.exit(1)
    with open(CFG_PATH) as f:
        return json.load(f)


def bib_of(name: str):
    m = BIB_RE.match(name)
    return m.group(1) if m else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true",
                    help="Re-process files even if the output exists.")
    ap.add_argument("--only", default="",
                    help="Comma-separated list of bib numbers to process.")
    ap.add_argument("--model", default=None,
                    help="Override rembg model (e.g. 'birefnet-portrait').")
    args = ap.parse_args()

    cfg = load_config()
    src = Path(cfg["sourceFolder"])
    dst = Path(cfg["transparentFolder"])
    model = args.model or cfg.get("rembgModel") or "u2net_human_seg"

    if not src.exists():
        print(f"sourceFolder does not exist: {src}", file=sys.stderr)
        sys.exit(1)
    dst.mkdir(parents=True, exist_ok=True)

    only = {b.strip() for b in args.only.split(",") if b.strip()}

    print(f"  source: {src}")
    print(f"  output: {dst}")
    print(f"  model:  {model}")
    print()

    session = new_session(model_name=model)

    candidates = [p for p in sorted(src.iterdir())
                  if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]
    if not candidates:
        print(f"No source images found in {src}")
        return

    processed = skipped = no_bib = errored = 0
    for src_path in candidates:
        bib = bib_of(src_path.name)
        if not bib:
            print(f"  ?  {src_path.name}: no leading bib — skipped")
            no_bib += 1
            continue
        if only and bib not in only:
            continue

        # Preserve original "bib + rest" filename, switch to .png.
        out_name = src_path.stem + ".png"
        out_path = dst / out_name

        if out_path.exists() and not args.force:
            skipped += 1
            continue

        try:
            with Image.open(src_path) as img:
                if img.mode not in {"RGB", "RGBA"}:
                    img = img.convert("RGBA")
                cut = remove(img, session=session)
                if cut.mode != "RGBA":
                    cut = cut.convert("RGBA")
                framed = frame_for_card(cut)
                framed.save(out_path, "PNG", optimize=True)
            print(f"  ✓  {bib:>4}  {src_path.name}  ->  {out_name}")
            processed += 1
        except Exception as exc:
            print(f"  !  {bib:>4}  {src_path.name}: {exc}", file=sys.stderr)
            errored += 1

    print()
    print(f"  processed: {processed}   skipped (already done): {skipped}   "
          f"no-bib: {no_bib}   errors: {errored}")


if __name__ == "__main__":
    main()
