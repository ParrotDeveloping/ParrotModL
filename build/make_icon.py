#!/usr/bin/env python3
"""ParrotModL icon generator - blue themed parrot mark."""
import math
from PIL import Image, ImageDraw, ImageFilter

S = 1024


def rounded_rect_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def vgrad(size, top, bottom):
    img = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / max(1, size - 1)
        img.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img.resize((size, size), Image.BILINEAR).convert("RGBA")


def main():
    bg = vgrad(S, (0x08, 0x27, 0x59), (0x22, 0x74, 0xFF))

    # soft radial glow, top-left
    glow = Image.new("L", (S, S), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-S * 0.35, -S * 0.45, S * 0.85, S * 0.75], fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.16))
    white = Image.new("RGBA", (S, S), (190, 225, 255, 255))
    white.putalpha(glow)
    bg = Image.alpha_composite(bg, white)

    cx, cy = S * 0.535, S * 0.505
    R = S * 0.285

    head_pts = [
        (cx - R * 0.92, cy + R * 0.02),
        (cx - R * 0.78, cy - R * 0.62),
        (cx - R * 0.22, cy - R * 1.00),
        (cx + R * 0.44, cy - R * 0.88),
        (cx + R * 0.88, cy - R * 0.32),
        (cx + R * 0.90, cy + R * 0.30),
        (cx + R * 0.46, cy + R * 0.94),
        (cx - R * 0.28, cy + R * 1.06),
        (cx - R * 0.84, cy + R * 0.64),
    ]

    # ---- crest (behind head) ----
    crest = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cdr = ImageDraw.Draw(crest)
    for i, (ang, ln, col) in enumerate(
        [
            (-128, 1.30, (0x5E, 0xAE, 0xFF, 255)),
            (-108, 1.62, (0x8F, 0xCB, 0xFF, 255)),
            (-88, 1.72, (0xBF, 0xE3, 0xFF, 255)),
            (-68, 1.48, (0x8F, 0xCB, 0xFF, 255)),
            (-50, 1.16, (0x5E, 0xAE, 0xFF, 255)),
        ]
    ):
        a = math.radians(ang)
        bx, by = cx + math.cos(a) * R * 0.45, cy + math.sin(a) * R * 0.45
        tx, ty = cx + math.cos(a - 0.06) * R * ln, cy + math.sin(a - 0.06) * R * ln
        px, py = -math.sin(a) * R * 0.22, math.cos(a) * R * 0.22
        cdr.polygon([(bx + px, by + py), (bx - px, by - py), (tx, ty)], fill=col)

    # ---- head body ----
    head = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(head)
    hd.polygon(head_pts, fill=(0xEE, 0xF5, 0xFF, 255))

    head_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(head_mask).polygon(head_pts, fill=255)

    # shading + wing, clipped to head
    inner = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    idr = ImageDraw.Draw(inner)
    idr.ellipse([cx - R * 0.16, cy - R * 0.02, cx + R * 1.05, cy + R * 1.15],
                fill=(0xCF, 0xE7, 0xFF, 255))
    idr.polygon(
        [
            (cx + R * 0.12, cy + R * 0.34),
            (cx + R * 0.92, cy + R * 0.02),
            (cx + R * 0.74, cy + R * 0.98),
            (cx + R * 0.06, cy + R * 0.92),
        ],
        fill=(0x2F, 0x82, 0xFF, 255),
    )
    idr.polygon(
        [
            (cx + R * 0.26, cy + R * 0.48),
            (cx + R * 0.80, cy + R * 0.24),
            (cx + R * 0.66, cy + R * 0.88),
            (cx + R * 0.22, cy + R * 0.84),
        ],
        fill=(0x77, 0xB6, 0xFF, 255),
    )
    head = Image.composite(inner, head, Image.composite(inner.split()[3], Image.new("L", (S, S), 0), head_mask))

    # ---- beak ----
    bk = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bk)
    bd.polygon(
        [
            (cx - R * 0.66, cy - R * 0.34),
            (cx - R * 1.58, cy + R * 0.14),
            (cx - R * 0.70, cy + R * 0.62),
            (cx - R * 0.50, cy + R * 0.06),
        ],
        fill=(0xFF, 0xB4, 0x33, 255),
    )
    bd.polygon(
        [
            (cx - R * 0.74, cy + R * 0.18),
            (cx - R * 1.22, cy + R * 0.36),
            (cx - R * 0.70, cy + R * 0.62),
        ],
        fill=(0xE4, 0x8A, 0x10, 255),
    )

    # ---- eye ----
    eye = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ed = ImageDraw.Draw(eye)
    ex, ey = cx - R * 0.10, cy - R * 0.30
    ed.ellipse([ex - R * 0.29, ey - R * 0.29, ex + R * 0.29, ey + R * 0.29], fill=(0x0A, 0x25, 0x51, 255))
    ed.ellipse([ex - R * 0.12, ey - R * 0.17, ex + R * 0.03, ey - R * 0.01], fill=(255, 255, 255, 255))

    mark = Image.alpha_composite(crest, head)
    mark = Image.alpha_composite(mark, bk)
    mark = Image.alpha_composite(mark, eye)

    # drop shadow
    sh = mark.split()[3].filter(ImageFilter.GaussianBlur(S * 0.022))
    shadow = Image.new("RGBA", (S, S), (2, 14, 38, 0))
    shadow.putalpha(sh.point(lambda v: int(v * 0.40)))
    shadow = shadow.transform((S, S), Image.AFFINE, (1, 0, -S * 0.010, 0, 1, -S * 0.022))

    art = Image.alpha_composite(bg, shadow)
    art = Image.alpha_composite(art, mark)

    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(art, (0, 0), rounded_rect_mask(S, int(S * 0.225)))

    out.save("build/icon.png")
    sizes = [16, 24, 32, 48, 64, 128, 256]
    out.resize((256, 256), Image.LANCZOS).save("build/icon.ico", format="ICO",
                                               sizes=[(s, s) for s in sizes])
    out.resize((256, 256), Image.LANCZOS).save("src/renderer/assets/logo.png")
    print("icon written")


if __name__ == "__main__":
    main()
