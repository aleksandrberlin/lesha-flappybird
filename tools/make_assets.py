#!/usr/bin/env python3
"""Generate the 8-bit assets used by the game.

  python3 tools/make_assets.py path/to/photo.jpg

Produces:
  assets/hero.png      - 32x32 pixel-art head cut out of the photo
  src/assets-data.js   - the same sprite inlined as base64 + hand-made sprites

The photo itself is never committed; only the pixelated sprite is.
"""
import base64
import json
import os
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Head position inside the source photo (centre x, centre y, square crop size).
HEAD = (555, 885, 900)
# Half width / half height of the head inside that crop, in source pixels.
HEAD_RX, HEAD_RY = 320, 425
SIZE = 32
OUTLINE = (26, 20, 34, 255)


def build_hero(photo_path):
    src = ImageOps.exif_transpose(Image.open(photo_path)).convert("RGB")
    cx, cy, s = HEAD
    face = src.crop((cx - s // 2, cy - s // 2, cx + s // 2, cy + s // 2))

    small = face.resize((SIZE, SIZE), Image.BOX)
    small = ImageEnhance.Color(small).enhance(1.55)
    small = ImageEnhance.Contrast(small).enhance(1.18)
    small = ImageEnhance.Brightness(small).enhance(1.05)
    flat = small.quantize(colors=16, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")

    # Head-shaped cut-out, rasterised at 8x then thresholded for hard pixel edges.
    up = 8
    rx, ry = HEAD_RX / s * SIZE, HEAD_RY / s * SIZE
    mask = Image.new("L", (SIZE * up, SIZE * up), 0)
    ImageDraw.Draw(mask).ellipse(
        ((SIZE / 2 - rx) * up, (SIZE / 2 - ry) * up,
         (SIZE / 2 + rx) * up - 1, (SIZE / 2 + ry) * up - 1), fill=255)
    mask = mask.resize((SIZE, SIZE), Image.BOX).point(lambda v: 255 if v >= 128 else 0)

    # Drop the sky that survives inside the ellipse: skin and hair are never blue.
    mp, fp = mask.load(), flat.load()
    for y in range(SIZE):
        for x in range(SIZE):
            r, g, b = fp[x, y]
            if mp[x, y] and b > r + 22 and b > 130:
                mp[x, y] = 0

    head = flat.convert("RGBA")
    head.putalpha(mask)

    # One pixel of dark outline so the sprite reads against any background.
    src_px = head.load()
    out = head.copy()
    out_px = out.load()
    for y in range(SIZE):
        for x in range(SIZE):
            if src_px[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < SIZE and 0 <= ny < SIZE and src_px[nx, ny][3]:
                    out_px[x, y] = OUTLINE
                    break
    return out


# --- hand drawn sprites -------------------------------------------------------
# Every sprite is a list of equally long rows; each character is a palette key,
# "." means transparent.

KATY = {
    "w": 16,
    "pal": {
        "K": "#241533", "k": "#3d2350", "S": "#f3b189", "s": "#cd8560",
        "W": "#ffffff", "P": "#1a1024", "L": "#e03a5c", "D": "#ff3ea5",
        "d": "#c41f77", "M": "#ffd447", "G": "#c8ccd8",
    },
    "rows": [
        ".....KKKKKK.....",
        "....KKKKKKKK....",
        "...KKKKKKKKKK...",
        "...KKkkkkkkKK...",
        "..KKKSSSSSSKKK..",
        "..KKSSSSSSSSKK..",
        "..KKSWPSSWPSKK..",
        "..KKSSSSSSSSKK..",
        "..KKSSSLLSSSKK..",
        "..KKKSSSSSSKKK..",
        "...KKKSSSSKKK...",
        "...KKKKSSKKKK...",
        "..KKDDDDDDDDKK..",
        "..KKDDMMMMDDKK..",
        ".KKKDDDDDDDDKKK.",
        ".KKDDDDDDDDDDKK.",
        "MMSDDDDDDDDDDS..",
        "GGSDDDdddddDDS..",
        ".GSDDDDDDDDDDS..",
        "...DDDDDDDDDD...",
        "...dDDDDDDDDd...",
        "....DDDDDDDD....",
        "...SS......SS...",
        "...ss......ss...",
    ],
}

# --- cola bottle --------------------------------------------------------------
# The obstacle is a giant cola bottle: a fixed cap/neck/shoulder sprite sitting at
# the edge of the gap plus a body slice repeated out to the edge of the screen.
COLA_W = 28
COLA_PAL = {
    "R": "#e2243a", "r": "#a8122a", "H": "#ff6070", "W": "#ffffff",
    "D": "#4a0d1b", "M": "#e6e8f0", "m": "#8d94a8",
}


def bottle_row(a, b, pal="glass", band=False):
    """One row of bottle, filled between columns a..b inclusive."""
    row = ["."] * COLA_W
    for x in range(a, b + 1):
        if x in (a, b):
            c = "D"                                  # outline
        elif x in (a + 1, b - 1):
            c = "r"                                  # shaded edge
        elif x == a + 2:
            c = "H"                                  # specular highlight
        elif x == b - 2:
            c = "r"
        else:
            c = "W" if band else "R"
        if pal == "metal":
            c = {"D": "D", "r": "m", "H": "M", "R": "M", "W": "M"}[c]
        row[x] = c
    return "".join(row)


def build_cola():
    neck_a, neck_b = 10, 17
    rows = [bottle_row(neck_a, neck_b, "metal") for _ in range(5)]      # crown cap
    rows += [bottle_row(neck_a, neck_b) for _ in range(9)]              # neck
    for step in range(1, 11):                                           # shoulder flare
        rows.append(bottle_row(max(neck_a - step, 0), min(neck_b + step, COLA_W - 1)))
    rows += [bottle_row(0, COLA_W - 1) for _ in range(2)]
    rows += [bottle_row(0, COLA_W - 1, band=True) for _ in range(3)]    # white label band
    rows += [bottle_row(0, COLA_W - 1) for _ in range(2)]
    cap = {"w": COLA_W, "pal": COLA_PAL, "rows": rows}
    body = {"w": COLA_W, "pal": COLA_PAL,
            "rows": [bottle_row(0, COLA_W - 1) for _ in range(4)]}
    return cap, body


COLA_CAP, COLA_BODY = build_cola()


def check(sprite, name):
    w = sprite["w"]
    for i, row in enumerate(sprite["rows"]):
        if len(row) != w:
            raise SystemExit(f"{name}: row {i} is {len(row)} wide, expected {w}")
        for ch in row:
            if ch != "." and ch not in sprite["pal"]:
                raise SystemExit(f"{name}: row {i} uses unknown palette key {ch!r}")


def main():
    photo = sys.argv[1] if len(sys.argv) > 1 else None
    for name, sp in (("katy", KATY), ("colaCap", COLA_CAP), ("colaBody", COLA_BODY)):
        check(sp, name)

    hero_path = os.path.join(ROOT, "assets", "hero.png")
    if photo:
        os.makedirs(os.path.dirname(hero_path), exist_ok=True)
        build_hero(photo).save(hero_path, optimize=True)
        print("wrote", hero_path)
    b64 = base64.b64encode(open(hero_path, "rb").read()).decode()

    sprites = {"katy": KATY, "colaCap": COLA_CAP, "colaBody": COLA_BODY}
    out = os.path.join(ROOT, "src", "assets-data.js")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as fh:
        fh.write("// Generated by tools/make_assets.py - do not edit by hand.\n")
        fh.write('const HERO_PNG = "data:image/png;base64,' + b64 + '";\n\n')
        fh.write("const SPRITE_DATA = " + json.dumps(sprites, indent=2) + ";\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
