"""Cut the app's brand assets out of the two logo files in ``assets/brand``.

The logo arrived as a pair of 1024x1024 JPEGs: one white-on-black, one
black-on-white. Neither is usable directly. The app is a dark broadcast on
near-black, so every mark it draws has to be white ink on transparency, and a
JPEG has no transparency to give. The light file is the one with the cleaner
edges to threshold against, so the alpha channel is cut from it and the ink is
painted white afterwards.

The source is one square lockup, but the app needs the two halves separately:
the monogram is tall (roughly 7:12) and the wordmark is wide (roughly 7:1), and
a header bar has room for them side by side but not stacked. So the file is
split at the band of blank rows between them.

Run from the repository root:

    uv run --with pillow --no-project python scripts/build_brand_assets.py
"""

from __future__ import annotations

import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "brand" / "rammeslag-logo-light.jpg"
BRAND = ROOT / "public" / "brand"
ICONS = ROOT / "public" / "icons"

# --color-ink-950, the page background. An iOS home-screen icon may not be
# transparent, so the icons are composited onto the colour the app opens on.
INK = (4, 6, 10, 255)

# Ink bounds measured on the source, in source pixels (left, top, right, bottom).
MARK_BOX = (354, 108, 697, 696)
WORDMARK_BOX = (85, 764, 916, 877)

# Everything below this luminance is ink, everything above it is paper. The
# window is wide enough that JPEG ringing around the edges lands inside the
# ramp rather than as a halo of half-opaque pixels.
INK_LEVEL, PAPER_LEVEL = 40, 215


def ink_alpha(source: Image.Image) -> Image.Image:
    """A white image whose alpha is the source's black ink."""
    luma = source.convert("L")
    span = PAPER_LEVEL - INK_LEVEL
    alpha = luma.point(lambda v: max(0, min(255, round((PAPER_LEVEL - v) * 255 / span))))
    white = Image.new("RGBA", source.size, (255, 255, 255, 0))
    white.putalpha(alpha)
    return white


def on_ink(mark: Image.Image, size: int, coverage: float) -> Image.Image:
    """The mark centred on the app's background, filling ``coverage`` of the height."""
    height = round(size * coverage)
    width = round(mark.width * height / mark.height)
    scaled = mark.resize((width, height), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), INK)
    canvas.alpha_composite(scaled, ((size - width) // 2, (size - height) // 2))
    return canvas


def main() -> None:
    BRAND.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)

    white = ink_alpha(Image.open(SOURCE))
    mark = white.crop(MARK_BOX)
    wordmark = white.crop(WORDMARK_BOX)

    # Twice the size they are ever drawn at, for a 2x/3x phone screen.
    mark.resize((mark.width * 2, mark.height * 2), Image.LANCZOS).save(BRAND / "mark.png")
    wordmark.resize((wordmark.width * 2, wordmark.height * 2), Image.LANCZOS).save(
        BRAND / "wordmark.png"
    )

    # The home-screen icon is the monogram alone. At 60x60 on a phone the
    # wordmark under it would be four pixels tall, which is a smudge, not a
    # name -- and the name is already under the icon where the OS puts it.
    for name, size, coverage in (
        ("icon-192.png", 192, 0.66),
        ("icon-512.png", 512, 0.66),
        # Maskable icons get cropped to a circle inscribed in the middle 80%,
        # so this one keeps well inside that.
        ("icon-maskable-512.png", 512, 0.50),
        ("apple-touch-icon.png", 180, 0.62),
    ):
        on_ink(mark, size, coverage).convert("RGB").save(ICONS / name)

    print("mark", mark.size, "wordmark", wordmark.size)


if __name__ == "__main__":
    main()
