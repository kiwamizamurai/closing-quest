#!/usr/bin/env python3
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src"
OUT = ROOT / "public" / "assets" / "art"

CELL = 256
MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
KIND_ORDER = ["journal", "deadline", "calc", "audit", "decision", "report"]


def circle_mask(size: int, radius: float) -> Image.Image:
    big = Image.new("L", (size * 4, size * 4), 0)
    c = size * 2
    r = radius * 4
    ImageDraw.Draw(big).ellipse([c - r, c - r, c + r, c + r], fill=255)
    return big.resize((size, size), Image.LANCZOS)


def coin_geometry(im: Image.Image) -> tuple[float, float, float]:
    a = np.asarray(im.convert("RGB")).astype(int)
    ys, xs = np.where(a.min(axis=2) < 225)
    x0, x1, y0 = int(xs.min()), int(xs.max()), int(ys.min())
    d = float(x1 - x0)
    return (x0 + x1) / 2, y0 + d / 2, d


def load_coin(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGB")
    cx, cy, d = coin_geometry(im)
    half = d * 1.024 / 2
    tile = im.crop((round(cx - half), round(cy - half), round(cx + half), round(cy + half)))
    tile = tile.resize((CELL, CELL), Image.LANCZOS).convert("RGBA")
    tile.putalpha(circle_mask(CELL, (d / 2 * 0.994) / (half * 2) * CELL))
    return tile


def atlas(cells: list[Image.Image], cols: int) -> Image.Image:
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * CELL, rows * CELL), (0, 0, 0, 0))
    for i, cell in enumerate(cells):
        sheet.paste(cell, ((i % cols) * CELL, (i // cols) * CELL), cell)
    return sheet


def make_desk() -> None:
    a = np.asarray(Image.open(SRC / "desk_wood.jpeg").convert("RGB")).astype(np.float32)
    h, w = a.shape[:2]
    win = (np.sin(np.linspace(0, np.pi, h)) ** 2)[:, None] * (np.sin(np.linspace(0, np.pi, w)) ** 2)[None, :]
    win = win[..., None]
    shifted = np.roll(a, (h // 2, w // 2), axis=(0, 1))
    out = a * win + shifted * (1 - win)
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(OUT / "desk_wood.jpeg", quality=90, optimize=True)


def make_mascot() -> None:
    im = Image.open(SRC / "mascot.jpeg").convert("RGBA")
    w, h = im.size
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(im, seed, (255, 255, 255, 0), thresh=28)
    im.putalpha(im.getchannel("A").filter(ImageFilter.MinFilter(3)))
    im.resize((512, 512), Image.LANCZOS).save(OUT / "mascot.png", optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    atlas([load_coin(SRC / f"month_{m:02d}.jpeg") for m in MONTH_ORDER], 4).save(OUT / "month_icons.png", optimize=True)
    atlas([load_coin(SRC / f"kind_{k}.jpeg") for k in KIND_ORDER], 3).save(OUT / "kind_icons.png", optimize=True)
    make_desk()
    make_mascot()


if __name__ == "__main__":
    main()
