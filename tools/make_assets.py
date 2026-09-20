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
import math
import os
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Head position inside the source photo (centre x, centre y, square crop size),
# read off the photo at pixel zoom: ears at x=255 and x=978, crown at y=555,
# bottom of the beard at y=1480.
HEAD = (616, 1017, 1000)
# Half width / half height of the head inside that crop, in source pixels.
HEAD_RX, HEAD_RY = 362, 468
SIZE = 36
OUTLINE = (26, 20, 34, 255)


def largest_blob(mask_px):
    """The biggest 4-connected run of opaque pixels in the mask."""
    seen = set()
    best = set()
    for y in range(SIZE):
        for x in range(SIZE):
            if not mask_px[x, y] or (x, y) in seen:
                continue
            blob = set()
            stack = [(x, y)]
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                blob.add((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < SIZE and 0 <= ny < SIZE and mask_px[nx, ny] and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if len(blob) > len(best):
                best = blob
    return best


def build_hero(photo_path):
    src = ImageOps.exif_transpose(Image.open(photo_path)).convert("RGB")
    cx, cy, s = HEAD
    face = src.crop((cx - s // 2, cy - s // 2, cx + s // 2, cy + s // 2))

    small = face.resize((SIZE, SIZE), Image.BOX)
    small = ImageEnhance.Color(small).enhance(1.6)
    small = ImageEnhance.Contrast(small).enhance(1.24)
    small = ImageEnhance.Brightness(small).enhance(1.08)
    flat = small.quantize(colors=16, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")

    # Head-shaped cut-out, rasterised at 8x then thresholded for hard pixel edges.
    up = 8
    rx, ry = HEAD_RX / s * SIZE, HEAD_RY / s * SIZE
    mask = Image.new("L", (SIZE * up, SIZE * up), 0)
    ImageDraw.Draw(mask).ellipse(
        ((SIZE / 2 - rx) * up, (SIZE / 2 - ry) * up,
         (SIZE / 2 + rx) * up - 1, (SIZE / 2 + ry) * up - 1), fill=255)
    mask = mask.resize((SIZE, SIZE), Image.BOX).point(lambda v: 255 if v >= 128 else 0)

    # Drop the background that survives inside the ellipse. Sky is plainly blue;
    # the lake and the city behind the head are pale and never warm like skin,
    # and they only ever show up close to the edge of the cut-out.
    mp, fp = mask.load(), flat.load()
    for y in range(SIZE):
        for x in range(SIZE):
            if not mp[x, y]:
                continue
            r, g, b = fp[x, y]
            edge = math.hypot((x + 0.5 - SIZE / 2) / rx, (y + 0.5 - SIZE / 2) / ry)
            if b > r + 22 and b > 130:
                mp[x, y] = 0
            elif edge > 0.74 and max(r, g, b) > 110 and b >= r:
                mp[x, y] = 0

    # Pale, cool pixels left hanging on the silhouette are background fringe.
    for _ in range(2):
        doomed = []
        for y in range(SIZE):
            for x in range(SIZE):
                if not mp[x, y]:
                    continue
                r, g, b = fp[x, y]
                if max(r, g, b) <= 110 or b < r:
                    continue
                open_sides = sum(
                    1 for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                    if not (0 <= nx < SIZE and 0 <= ny < SIZE) or not mp[nx, ny]
                )
                if open_sides:
                    doomed.append((x, y))
        for x, y in doomed:
            mp[x, y] = 0

    # Keep only the head itself - sky removal can leave loose specks behind.
    keep = largest_blob(mp)
    for y in range(SIZE):
        for x in range(SIZE):
            if mp[x, y] and (x, y) not in keep:
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

# Katy: long dark hair with a fringe, blue eyes, red lips and a purple stage
# dress with a star. She is the bonus pickup, not an enemy.
KATY = {
    "w": 18,
    "pal": {
        "K": "#1b0f24", "k": "#3c2350", "S": "#f6c49d", "s": "#d09a72",
        "W": "#ffffff", "B": "#39a9ea", "L": "#e0284c", "p": "#ef9aa4",
        "D": "#a34bd8", "d": "#7a30a8", "M": "#ffd447",
    },
    "rows": [
        "......KKKKKK......",
        "....KKKKKKKKKK....",
        "...KKKKKKKKKKKK...",
        "..KKKKKKKKKKKKKK..",
        "..KKKkkkkkkkkKKK..",
        "..KKSSSSSSSSSSKK..",
        "..KKSSSSSSSSSSKK..",
        "..KKSWBSSSSWBSKK..",
        "..KKSsSSSSSSsSKK..",
        "..KKpSSSSSSSSpKK..",
        "..KKSSsLLLLsSSKK..",
        "..KKSSSSSSSSSSKK..",
        "..KKKSSSSSSSSKKK..",
        "...KKKSSSSSSKKK...",
        "...KKKKSSSSKKKK...",
        "..KKKDDDDDDDDKKK..",
        "..KKDDDDDDDDDDKK..",
        "..KKDDDDMMDDDDKK..",
        ".KKKDDDDDDDDDDKKK.",
        ".KKDDDDDDDDDDDDKK.",
        "SKKDDDDDDDDDDDDKKS",
        "SSKDDDDddddDDDDKSS",
        ".S.DDDDDDDDDDDD.S.",
        "...DDDDDDDDDDDD...",
        "....SSS....SSS....",
        "....ss......ss....",
    ],
}

# A seagull off the lake, flying left. Two frames: wings up and wings down.
GULL_PAL = {"W": "#ffffff", "G": "#b9c4d4", "g": "#8b97ab", "O": "#ff9b22", "K": "#241533"}
GULL_UP = {
    "w": 15,
    "pal": GULL_PAL,
    "rows": [
        ".........KK....",
        "........KGG....",
        ".......GGGG....",
        "......GGGG.....",
        ".....GGGG......",
        "OOWWWWWWW......",
        ".WWKWWWWWWW....",
        ".WWWWWWWWWWWG..",
        "..WWWWWWWWGG...",
        "...WWWWWg......",
        ".....gg........",
    ],
}
GULL_DOWN = {
    "w": 15,
    "pal": GULL_PAL,
    "rows": [
        "...............",
        "...............",
        "OOWWWWWWW......",
        ".WWKWWWWWWW....",
        ".WWWWWWWWWWWG..",
        "..WWWWWWWWGG...",
        "...GGGGg.......",
        "....GGGG.......",
        ".....GGGG......",
        "......GGG......",
        ".......KK......",
    ],
}

# Paparazzi drone: dark body, camera lens, blinking light, spinning rotors.
DRONE_PAL = {
    "K": "#2b2438", "k": "#4a4160", "M": "#c8ccd8", "W": "#ffffff",
    "B": "#39a9ea", "R": "#ff4d4d", "g": "#7c8496",
}
DRONE_A = {
    "w": 16,
    "pal": DRONE_PAL,
    "rows": [
        "..ggg......ggg..",
        ".gg..g....g..gg.",
        "...kk......kk...",
        "....KKKKKKKK....",
        "...KKKKKKKKKK...",
        "..KKKMMWWMMKKK..",
        "..KKKMWBBWMKKK..",
        "..KKKMMWWMMKKK..",
        "...KKKKKKKKKK...",
        "....KKKRRKKK....",
        ".....kkkkkk.....",
    ],
}
DRONE_B = {
    "w": 16,
    "pal": DRONE_PAL,
    "rows": [
        "..g.g......g.g..",
        ".ggggg....ggggg.",
        "...kk......kk...",
        "....KKKKKKKK....",
        "...KKKKKKKKKK...",
        "..KKKMMWWMMKKK..",
        "..KKKMWBBWMKKK..",
        "..KKKMMWWMMKKK..",
        "...KKKKKKKKKK...",
        "....KKKWWKKK....",
        ".....kkkkkk.....",
    ],
}

# Spider-man hanging off his web: one arm up on the rope, legs tucked.
SPIDER = {
    "w": 14,
    "pal": {"R": "#d2222d", "r": "#8f1620", "B": "#1d3fa8", "b": "#132a70",
            "W": "#ffffff", "K": "#1a1024"},
    "rows": [
        "......RR......",
        "......RR......",
        ".....RRr......",
        "....RRr.......",
        "...KRRRRK.....",
        "..KRWWRWWRK...",
        "..KRWWRWWRK...",
        "...KRRRRK.....",
        "...BRRRRB.....",
        "..BBRRRRBB....",
        "..BBRRRRBB....",
        "...BBRRBB.....",
        "...BB..BB.....",
        "..BB....BB....",
        "..RB....BR....",
        "..RR....RR....",
    ],
}

# Heart used for the extra lives Katy hands out.
HEART = {
    "w": 7,
    "pal": {"R": "#ff4d6d", "r": "#c41f47", "W": "#ffd0dc"},
    "rows": [
        ".RR.RR.",
        "RWRRRRR",
        "RWRRRRR",
        "rRRRRRr",
        ".rRRRr.",
        "..rRr..",
        "...r...",
    ],
}

# --- cola bottle --------------------------------------------------------------
# The obstacle is a giant contour bottle: crown cap, neck, flared shoulder, the
# white wave across the label and a fluted body slice repeated to the edge.
COLA_W = 28
COLA_PAL = {
    "R": "#e2243a", "r": "#a8122a", "H": "#ff6070", "W": "#ffffff",
    "D": "#4a0d1b", "M": "#e6e8f0", "m": "#8d94a8", "f": "#c41b31",
}


def bottle_row(a, b, pal="glass", flutes=False):
    """One row of bottle glass, filled between columns a..b inclusive."""
    row = ["."] * COLA_W
    for x in range(a, b + 1):
        if x in (a, b):
            c = "D"                                  # dark outline
        elif x in (a + 1, b - 1):
            c = "r"                                  # shaded edge
        elif x == a + 2:
            c = "H"                                  # specular highlight
        elif x == b - 2:
            c = "r"
        else:
            c = "R"
        if pal == "metal":
            c = {"D": "D", "r": "m", "H": "M", "R": "M"}[c]
        elif flutes and c == "R" and (x - a) % 4 == 0:
            c = "f"                                  # the bottle's flutes
        row[x] = c
    return "".join(row)


def wave_row(a, b, on):
    """A row of the white ribbon that sweeps across the label."""
    row = list(bottle_row(a, b))
    for x in range(a + 2, b - 1):
        if on(x):
            row[x] = "W"
    return "".join(row)


def build_cola():
    neck_a, neck_b = 10, 17
    rows = [bottle_row(neck_a, neck_b, "metal") for _ in range(4)]     # crown cap
    rows.append(bottle_row(neck_a - 1, neck_b + 1, "metal"))           # cap skirt
    rows += [bottle_row(neck_a, neck_b) for _ in range(10)]            # neck
    # rounded shoulder: quick flare at the top, easing out to full width
    steps = 9
    for i in range(1, steps + 1):
        grow = round(10 * math.sin(math.pi / 2 * i / steps))
        rows.append(bottle_row(max(neck_a - grow, 1), min(neck_b + grow, COLA_W - 2)))
    rows += [bottle_row(0, COLA_W - 1) for _ in range(2)]

    # the white wave, four rows of a ribbon rising to the right
    for on in (lambda x: x < 12 or 18 <= x < 24,
               lambda x: x < 15 or 20 <= x < 25,
               lambda x: 6 <= x < 20,
               lambda x: 3 <= x < 14):
        rows.append(wave_row(0, COLA_W - 1, on))

    rows += [bottle_row(0, COLA_W - 1) for _ in range(2)]
    rows.append(bottle_row(1, COLA_W - 2))                             # waist pinch
    rows.append(bottle_row(1, COLA_W - 2, flutes=True))
    rows += [bottle_row(0, COLA_W - 1, flutes=True) for _ in range(2)]

    cap = {"w": COLA_W, "pal": COLA_PAL, "rows": rows}
    body = {"w": COLA_W, "pal": COLA_PAL,
            "rows": [bottle_row(0, COLA_W - 1, flutes=True) for _ in range(4)]}
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
    sprites = {
        "katy": KATY, "colaCap": COLA_CAP, "colaBody": COLA_BODY,
        "gullUp": GULL_UP, "gullDown": GULL_DOWN,
        "droneA": DRONE_A, "droneB": DRONE_B,
        "heart": HEART, "spider": SPIDER,
    }
    for name, sp in sprites.items():
        check(sp, name)

    hero_path = os.path.join(ROOT, "assets", "hero.png")
    if photo:
        os.makedirs(os.path.dirname(hero_path), exist_ok=True)
        build_hero(photo).save(hero_path, optimize=True)
        print("wrote", hero_path)
    b64 = base64.b64encode(open(hero_path, "rb").read()).decode()

    out = os.path.join(ROOT, "src", "assets-data.js")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as fh:
        fh.write("// Generated by tools/make_assets.py - do not edit by hand.\n")
        fh.write('const HERO_PNG = "data:image/png;base64,' + b64 + '";\n\n')
        fh.write("const SPRITE_DATA = " + json.dumps(sprites, indent=2) + ";\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
