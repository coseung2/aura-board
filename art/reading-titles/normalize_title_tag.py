"""Normalize pixel title tags to the walking-title deliverable geometry.

Fits visible (non-transparent) pixels inside a 480x88 box on a 512x128 canvas
using nearest-neighbor sampling so the pixel grid stays hard-edged.
"""

import argparse
from pathlib import Path

from PIL import Image

CANVAS = (512, 128)
FIT_BOX = (480, 88)


def normalize(src: Path, dst: Path) -> None:
    image = Image.open(src).convert("RGBA")
    bbox = image.getbbox()
    if bbox is None:
        raise SystemExit(f"no visible pixels in {src}")

    cropped = image.crop(bbox)
    scale = min(FIT_BOX[0] / cropped.width, FIT_BOX[1] / cropped.height)
    size = (
        max(1, round(cropped.width * scale)),
        max(1, round(cropped.height * scale)),
    )
    resized = cropped.resize(size, Image.NEAREST)

    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    canvas.paste(
        resized,
        ((CANVAS[0] - size[0]) // 2, (CANVAS[1] - size[1]) // 2),
        resized,
    )
    dst.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dst)
    print(f"{dst} <- {src.name} crop={cropped.size} fitted={size}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    normalize(Path(args.input), Path(args.out))


if __name__ == "__main__":
    main()
