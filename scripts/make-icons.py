"""Draws the GameMotion app icon and writes every format the packagers need.

    python3 scripts/make-icons.py

Outputs build/icon.png (1024 px), build/icon.ico (Windows), build/icon.icns
(macOS) and resources/icon.png (window icon on Linux). Needs Pillow.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
S = 1024  # drawn at 1024 px, then downscaled for smaller sizes


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw() -> Image.Image:
    # Rounded-square background with a vertical night-sky gradient.
    bg = Image.new("RGBA", (S, S))
    top, bottom = (16, 33, 63), (29, 78, 137)
    px = bg.load()
    for y in range(S):
        c = lerp(top, bottom, y / (S - 1))
        for x in range(S):
            px[x, y] = (*c, 255)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([40, 40, S - 40, S - 40], radius=210, fill=255)
    icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    icon.paste(bg, (0, 0), mask)

    d = ImageDraw.Draw(icon)
    white = (255, 255, 255, 255)
    # Motion arcs around the raised hand.
    for i, alpha in enumerate((200, 130, 70)):
        r = 150 + i * 55
        d.arc([700 - r, 330 - r, 700 + r, 330 + r], start=200, end=250, fill=(54, 209, 255, alpha), width=26)
    # Balloon (top right) with highlight and string.
    d.ellipse([650, 130, 870, 390], fill=(255, 77, 109, 255))
    d.ellipse([695, 170, 760, 260], fill=(255, 255, 255, 90))
    d.polygon([(745, 388), (775, 388), (760, 408)], fill=(255, 77, 109, 255))
    d.line([(760, 408), (740, 520)], fill=(255, 255, 255, 200), width=8)
    # Figure: head, body, arms raised in a V, legs.
    d.ellipse([440, 290, 580, 430], fill=white)
    lw = 54
    d.line([(510, 400), (510, 690)], fill=white, width=lw)  # neck and body
    d.line([(510, 470), (330, 300)], fill=white, width=lw)  # left arm up
    d.line([(510, 470), (690, 330)], fill=white, width=lw)  # right arm up
    d.line([(510, 680), (380, 880)], fill=white, width=lw)  # legs
    d.line([(510, 680), (640, 880)], fill=white, width=lw)
    for x, y in [(330, 300), (690, 330), (380, 880), (640, 880), (510, 690), (510, 470)]:
        d.ellipse([x - lw / 2, y - lw / 2, x + lw / 2, y + lw / 2], fill=white)  # round joints

    # Soft shadow under everything for depth.
    shadow = icon.split()[3].filter(ImageFilter.GaussianBlur(18)).point(lambda a: a * 0.35)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste((0, 0, 0, 255), (0, 14), shadow)
    out.alpha_composite(icon)
    return out


def main() -> None:
    img = draw()
    (ROOT / "build").mkdir(exist_ok=True)
    (ROOT / "resources").mkdir(exist_ok=True)
    img.save(ROOT / "build" / "icon.png")
    img.resize((512, 512), Image.LANCZOS).save(ROOT / "resources" / "icon.png")
    img.save(ROOT / "build" / "icon.ico", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
    img.save(ROOT / "build" / "icon.icns")
    print("Icons written to build/ and resources/")


if __name__ == "__main__":
    main()
