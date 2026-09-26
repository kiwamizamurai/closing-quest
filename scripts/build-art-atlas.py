#!/usr/bin/env python3
"""
イラスト素材のアトラスを作る。

入力  art-src/month_01.jpeg … month_12.jpeg   Gemini で生成した月のコイン（1024x1024、白背景）
      art-src/kind_journal.jpeg, kind_deadline.jpeg, kind_calc.jpeg
出力  public/assets/art/month_icons.png   4列x3行、左上から 4月 → 翌3月（円形に切り抜き、透過）
      public/assets/art/kind_icons.png    3列x2行、JOURNAL, DEADLINE, CALC, AUDIT, DECISION, REPORT

AUDIT / DECISION / REPORT の 3 つは、生成できなかったので同じコイン風の絵をここで描く。
Gemini で同じ絵柄を生成できたら art-src/kind_audit.jpeg などを置けば、そちらを優先する。

実行: python3 scripts/build-art-atlas.py   （Pillow が必要）
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src"
OUT = ROOT / "public" / "assets" / "art"

CELL = 256
# 生成画像の中のコイン：中心 (512, 513)、直径 約 782px。切り抜きは余白を少し入れた 800px 四方
CENTER = (512, 513)
CROP = 800
MASK_R = 388  # コインの外縁のにじみを落とす半径（元画像のpx）

MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
KIND_ORDER = ["journal", "deadline", "calc", "audit", "decision", "report"]

GOLD = (232, 186, 66)
GOLD_LIGHT = (250, 220, 130)
GOLD_DARK = (176, 128, 40)
BROWN = (150, 98, 58)
CREAM = (255, 246, 224)


def circle_mask(size: int, radius: float) -> Image.Image:
    """縁をなめらかにした円形マスク（4 倍で描いて縮小）。"""
    big = Image.new("L", (size * 4, size * 4), 0)
    c = size * 2
    r = radius * 4
    ImageDraw.Draw(big).ellipse([c - r, c - r, c + r, c + r], fill=255)
    return big.resize((size, size), Image.LANCZOS)


def load_coin(path: Path) -> Image.Image:
    """生成したコイン画像を、円形に切り抜いて透過 PNG（CELL 四方）にする。"""
    im = Image.open(path).convert("RGB")
    cx, cy = CENTER
    half = CROP // 2
    box = (cx - half, cy - half, cx + half, cy + half)
    tile = im.crop(box).resize((CELL, CELL), Image.LANCZOS).convert("RGBA")
    tile.putalpha(circle_mask(CELL, MASK_R / CROP * CELL))
    return tile


def sparkle(d: ImageDraw.ImageDraw, x: float, y: float, r: float, fill) -> None:
    """4 つの尖ったキラキラ。"""
    k = r * 0.28
    d.polygon([(x, y - r), (x + k, y - k), (x + r, y), (x + k, y + k), (x, y + r), (x - k, y + k), (x - r, y), (x - k, y - k)], fill=fill)


def coin_base(fill) -> Image.Image:
    """金の縁つきのコイン（1024 四方、透過）。"""
    im = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy = CENTER
    for r, col in [(391, GOLD_DARK), (384, GOLD), (366, GOLD_LIGHT), (352, GOLD), (344, fill)]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    sparkle(d, cx - 235, cy - 215, 34, (255, 255, 255, 235))
    sparkle(d, cx + 245, cy - 150, 24, (255, 240, 170, 235))
    sparkle(d, cx + 215, cy + 230, 28, (255, 255, 255, 220))
    sparkle(d, cx - 250, cy + 180, 20, (255, 240, 170, 220))
    return im


def to_cell(im: Image.Image) -> Image.Image:
    cx, cy = CENTER
    half = CROP // 2
    tile = im.crop((cx - half, cy - half, cx + half, cy + half)).resize((CELL, CELL), Image.LANCZOS)
    return tile


def draw_audit() -> Image.Image:
    """虫めがねとチェックマーク。"""
    im = coin_base((255, 196, 132))
    d = ImageDraw.Draw(im)
    d.line([(575, 575), (690, 690)], fill=BROWN, width=78)
    d.line([(575, 575), (690, 690)], fill=(255, 226, 150), width=52)
    d.ellipse([340, 340, 620, 620], fill=BROWN)
    d.ellipse([362, 362, 598, 598], fill=(255, 255, 255))
    d.ellipse([378, 378, 582, 582], fill=(226, 244, 255))
    d.line([(420, 488), (466, 534), (545, 440)], fill=BROWN, width=52, joint="curve")
    d.line([(420, 488), (466, 534), (545, 440)], fill=(96, 184, 116), width=32, joint="curve")
    return im


def draw_decision() -> Image.Image:
    """分かれ道の道しるべ。"""
    im = coin_base((160, 218, 178))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([490, 300, 534, 720], radius=18, fill=BROWN)
    d.rounded_rectangle([498, 306, 526, 714], radius=12, fill=(206, 152, 96))
    right = [(410, 330), (610, 330), (672, 388), (610, 446), (410, 446)]
    left = [(614, 470), (414, 470), (352, 528), (414, 586), (614, 586)]
    for poly, col in ((right, CREAM), (left, (255, 232, 196))):
        d.polygon(poly, fill=col, outline=BROWN, width=12)
    d.ellipse([500, 258, 524, 282], fill=BROWN)
    return im


def draw_report() -> Image.Image:
    """棒グラフ。"""
    im = coin_base((150, 214, 220))
    d = ImageDraw.Draw(im)
    base_y = 690
    bars = [(340, 430, 170, (255, 214, 130)), (470, 560, 260, (255, 170, 170)), (600, 690, 360, (150, 196, 255))]
    for x0, x1, h, col in bars:
        d.rounded_rectangle([x0, base_y - h, x1, base_y], radius=16, fill=col, outline=BROWN, width=12)
    d.line([(310, base_y + 14), (720, base_y + 14)], fill=BROWN, width=16)
    d.line([(350, 470), (480, 380), (580, 420), (700, 300)], fill=(255, 255, 255), width=20, joint="curve")
    d.polygon([(700, 262), (740, 330), (664, 322)], fill=(255, 255, 255))
    return im


DRAWN = {"audit": draw_audit, "decision": draw_decision, "report": draw_report}


def kind_cell(kind: str) -> Image.Image:
    p = SRC / f"kind_{kind}.jpeg"
    if p.exists():
        return load_coin(p)
    return to_cell(DRAWN[kind]())


def atlas(cells: list[Image.Image], cols: int) -> Image.Image:
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * CELL, rows * CELL), (0, 0, 0, 0))
    for i, cell in enumerate(cells):
        sheet.paste(cell, ((i % cols) * CELL, (i // cols) * CELL), cell)
    return sheet


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    months = [load_coin(SRC / f"month_{m:02d}.jpeg") for m in MONTH_ORDER]
    atlas(months, 4).save(OUT / "month_icons.png", optimize=True)
    kinds = [kind_cell(k) for k in KIND_ORDER]
    atlas(kinds, 3).save(OUT / "kind_icons.png", optimize=True)
    print("month_icons.png, kind_icons.png を出力しました")


if __name__ == "__main__":
    main()
