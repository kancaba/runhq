#!/usr/bin/env python3
"""Generate the canonical 1024x1024 RunHQ app icon.

Design:
  * Rounded-square body filled with the brand ember gradient — the exact same
    gradient the `.btn-primary` CTA buttons use so the icon reads as "press me /
    launch". Gradient direction mirrors `linear-gradient(180deg, #fb923c 0%,
    #fdba74 100%)` from the app CSS.
  * Bold lightning bolt (the `lucide-react` `Zap` shape, already used as the
    inline brand mark in `TitleBar.tsx`). White fill with a soft inner glow.
  * Tiny specular highlight at top-left for iOS/macOS "glass" feel without
    looking skeuomorphic.

The bolt polygon uses the same 24-unit path as Lucide's `zap`:
    M13 2 L3 14 h9 l-1 8 10-12 h-9 l1-8 z

We rasterise in PIL instead of shipping an SVG source because Tauri's icon
pipeline consumes PNGs.

Re-run after tweaking colors:
    python3 scripts/generate-source-icon.py
    pnpm --filter @runhq/desktop exec tauri icon \\
        "$(pwd)/assets/icon-source.png" \\
        --output "$(pwd)/apps/desktop/src-tauri/icons"
    cp assets/icon-source.png docs/icon.png
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
OUT = Path(__file__).resolve().parent.parent / "assets" / "icon-source.png"

# Brand tokens (kept in sync with apps/desktop/src/styles.css :root.dark
# `--accent` / `--accent-hover` and docs/style.css `--accent` / `--accent-soft`).
EMBER_TOP = (251, 146, 60)     # #FB923C  — `--accent`
EMBER_BOT = (253, 186, 116)    # #FDBA74  — `--accent-hover` (lighter)
INK_WHITE = (255, 255, 255)
WARM_WHITE = (255, 247, 237)   # #FFF7ED — subtle warmth inside the bolt
INNER_DARK = (124, 45, 18)     # #7C2D12 — ember shadow for depth


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def vgradient(size: int, top: tuple[int, int, int], bot: tuple[int, int, int]) -> Image.Image:
    img = Image.new("RGB", (size, size), top)
    px = img.load()
    for y in range(size):
        color = lerp(top, bot, y / (size - 1))
        for x in range(size):
            px[x, y] = color
    return img


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def bolt_points(size: int, scale: float = 0.62) -> list[tuple[float, float]]:
    """Lucide `zap` filled path, remapped to `size` canvas.

    The source path is authored on a 24-unit grid; we centre it and scale it
    to `scale` (fraction) of the target size. Slight manual x/y offsets bring
    the visual centre of the path closer to the geometric centre (the bolt's
    centre of mass sits a few units right-and-up of its bbox centre).
    """
    raw = [
        (13.0, 2.0),
        (3.0, 14.0),
        (12.0, 14.0),
        (11.0, 22.0),
        (21.0, 10.0),
        (12.0, 10.0),
    ]
    s = size * scale / 24.0
    # Visually recentre: the bolt is taller than wide and leans right.
    offset_x = size / 2.0 - 12.0 * s - size * 0.005
    offset_y = size / 2.0 - 12.0 * s + size * 0.01
    return [(p[0] * s + offset_x, p[1] * s + offset_y) for p in raw]


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)

    # 1. Ember body
    body = vgradient(SIZE, EMBER_TOP, EMBER_BOT)
    mask = rounded_mask(SIZE, radius=220)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(body, (0, 0), mask)

    # 2. Inner top-left specular highlight (soft gloss, not cheesy).
    gloss = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).ellipse(
        (-SIZE * 0.1, -SIZE * 0.35, SIZE * 0.75, SIZE * 0.4),
        fill=(*INK_WHITE, 55),
    )
    gloss = gloss.filter(ImageFilter.GaussianBlur(60))
    gloss_clipped = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gloss_clipped.paste(gloss, (0, 0), mask)
    canvas = Image.alpha_composite(canvas, gloss_clipped)

    # 3. Bottom ember shadow — grounds the icon, prevents it from floating.
    shade = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(shade).ellipse(
        (SIZE * 0.0, SIZE * 0.55, SIZE * 1.0, SIZE * 1.15),
        fill=(*INNER_DARK, 70),
    )
    shade = shade.filter(ImageFilter.GaussianBlur(80))
    shade_clipped = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shade_clipped.paste(shade, (0, 0), mask)
    canvas = Image.alpha_composite(canvas, shade_clipped)

    # 4. Bolt drop shadow — subtle depth.
    bolt_pts = bolt_points(SIZE)
    drop = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shifted = [(x, y + 10) for (x, y) in bolt_pts]
    ImageDraw.Draw(drop).polygon(shifted, fill=(*INNER_DARK, 140))
    drop = drop.filter(ImageFilter.GaussianBlur(14))
    canvas = Image.alpha_composite(canvas, drop)

    # 5. The bolt itself — near-white with a slight warm cast so it lives
    #    inside the ember world rather than fighting it.
    bolt = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(bolt).polygon(bolt_pts, fill=(*WARM_WHITE, 255))
    canvas = Image.alpha_composite(canvas, bolt)

    # 6. Hairline inner stroke — echoes `.glass` borders in the app.
    stroke = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(stroke).rounded_rectangle(
        (3, 3, SIZE - 4, SIZE - 4),
        radius=218,
        outline=(*INK_WHITE, 38),
        width=2,
    )
    stroke_clipped = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    stroke_clipped.paste(stroke, (0, 0), mask)
    canvas = Image.alpha_composite(canvas, stroke_clipped)

    final = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    final.paste(canvas, (0, 0), mask)

    final.save(OUT, format="PNG")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
