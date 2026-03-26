from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
IMAGES_DIR = ROOT / "assets" / "images"
SOURCE_IMAGE = IMAGES_DIR / "icon-source.png"
SIZE = 1024


def load_source() -> Image.Image:
    if not SOURCE_IMAGE.exists():
        raise FileNotFoundError(f"Missing source icon: {SOURCE_IMAGE}")

    image = Image.open(SOURCE_IMAGE).convert("RGBA")
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))


def fit_square(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.Resampling.LANCZOS)


def fit_with_padding(image: Image.Image, size: int, padding: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = fit_square(image, size - padding * 2)
    canvas.alpha_composite(inner, dest=(padding, padding))
    return canvas


def create_android_background(size: int) -> Image.Image:
    return Image.new("RGBA", (size, size), (255, 255, 255, 255))


def create_monochrome_icon(image: Image.Image, size: int) -> Image.Image:
    padded = fit_with_padding(image, size, 92)
    grayscale = ImageOps.grayscale(padded)
    alpha = ImageOps.invert(grayscale).point(lambda value: 255 if value > 28 else 0)

    monochrome = Image.new("RGBA", (size, size), (26, 84, 34, 255))
    monochrome.putalpha(alpha)
    return monochrome


def write_image(filename: str, image: Image.Image, *, size: int | None = None) -> None:
    output = fit_square(image, size) if size else image
    output.save(IMAGES_DIR / filename)


def main() -> None:
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    source = load_source()
    icon = fit_square(source, SIZE)
    splash = fit_square(source, SIZE)
    android_foreground = fit_with_padding(source, SIZE, 86)
    android_background = create_android_background(SIZE)
    monochrome = create_monochrome_icon(source, SIZE)

    write_image("icon.png", icon)
    write_image("splash-icon.png", splash)
    write_image("android-icon-foreground.png", android_foreground)
    write_image("android-icon-background.png", android_background)
    write_image("android-icon-monochrome.png", monochrome)
    write_image("favicon.png", source, size=64)
    write_image("app-icon-preview.png", source, size=512)

    print("Icons generated in", IMAGES_DIR)


if __name__ == "__main__":
    main()
