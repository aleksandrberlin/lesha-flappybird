#!/usr/bin/env python3
"""Build the link preview card used by og:image (Telegram, Twitter, chats).

  python3 tools/make_preview.py [screenshot.png]

The screenshot is optional - pass a 320x480 (or bigger) capture of the title
screen to show it inside the card. Everything else is drawn with the game's own
bitmap font and sprites so the card matches the game.
"""
import json
import os
import re
import subprocess
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "preview.png")
W, H = 1200, 630
BG = (20, 12, 30)
BG_TOP = (44, 27, 68)


def load_font():
    src = open(os.path.join(ROOT, "src", "font.js")).read()
    glyphs = json.loads(subprocess.check_output([
        "node", "-e",
        'const vm=require("vm");vm.runInThisContext(require("fs").readFileSync(%r,"utf8"));'
        'console.log(JSON.stringify(FONT_GLYPHS))' % os.path.join(ROOT, "src", "font.js"),
    ]).decode())
    return glyphs


def draw_text(img, glyphs, text, x, y, scale, color):
    px = img.load()
    for i, ch in enumerate(text.upper()):
        rows = glyphs.get(ch)
        if not rows:
            continue
        gx = x + i * 6 * scale
        for ry, row in enumerate(rows.split(",")):
            for rx, bit in enumerate(row):
                if bit != "1":
                    continue
                for dy in range(scale):
                    for dx in range(scale):
                        sx, sy = gx + rx * scale + dx, y + ry * scale + dy
                        if 0 <= sx < img.width and 0 <= sy < img.height:
                            px[sx, sy] = color


def text_width(text, scale):
    return len(text) * 6 * scale - scale


def sprite_image(data, name, scale):
    sp = data[name]
    rows = sp["rows"]
    img = Image.new("RGBA", (sp["w"], len(rows)), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            c = sp["pal"][ch].lstrip("#")
            px[x, y] = tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
    return img.resize((img.width * scale, img.height * scale), Image.NEAREST)


def main():
    glyphs = load_font()
    sprites = json.loads(subprocess.check_output([
        "node", "-e",
        'const vm=require("vm");vm.runInThisContext(require("fs").readFileSync(%r,"utf8"));'
        'console.log(JSON.stringify(SPRITE_DATA))' % os.path.join(ROOT, "src", "assets-data.js"),
    ]).decode())

    card = Image.new("RGB", (W, H), BG)
    px = card.load()
    for y in range(H):                                   # soft vertical gradient
        t = max(0.0, 1 - y / (H * 0.9))
        row = tuple(int(BG[i] + (BG_TOP[i] - BG[i]) * t * 0.9) for i in range(3))
        for x in range(W):
            px[x, y] = row

    shot_path = sys.argv[1] if len(sys.argv) > 1 else None
    if shot_path and os.path.exists(shot_path):
        shot = Image.open(shot_path).convert("RGB")
        target_h = 566
        shot = shot.resize((round(shot.width * target_h / shot.height), target_h), Image.LANCZOS)
        bx, by = 72, (H - target_h) // 2
        card.paste((58, 37, 80), (bx - 6, by - 6, bx + shot.width + 6, by + target_h + 6))
        card.paste(shot, (bx, by))
        left = bx + shot.width + 70
    else:
        left = 90

    draw_text(card, glyphs, "flappy", left, 120, 11, (255, 212, 71))
    draw_text(card, glyphs, "lesha", left, 215, 11, (255, 62, 165))

    lines = [
        ("8-БИТНЫЙ ФЛАППИ БЁРД,", (255, 246, 224)),
        ("ГДЕ ВМЕСТО ПТИЧКИ ЛЁША", (255, 246, 224)),
        ("ЛОВИ ЖИЗНИ, СОБИРАЙ ЛЁШ", (185, 169, 214)),
        ("И ЛЕЗЬ В ОБЩИЙ РЕЙТИНГ", (185, 169, 214)),
    ]
    y = 326
    for i, (text, color) in enumerate(lines):
        if i == 2:
            y += 18                                      # a beat between the two pairs
        draw_text(card, glyphs, text, left, y, 4, color)
        y += 38

    row_y = 500
    x = left
    for name, scale in (("katy", 3), ("colaCap", 2), ("gullUp", 3), ("spider", 3), ("mac", 3)):
        sp = sprite_image(sprites, name, scale)
        card.paste(sp, (x, row_y + (90 - sp.height) // 2), sp)
        x += sp.width + 26

    card.save(OUT, optimize=True)
    print("wrote %s (%d KB)" % (OUT, os.path.getsize(OUT) // 1024))


if __name__ == "__main__":
    main()
