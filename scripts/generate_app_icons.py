from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
IMAGES_DIR = ROOT / "assets" / "images"
SIZE = 1024


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def blend_color(start: tuple[int, int, int], end: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(lerp(start[index], end[index], t) for index in range(3))


def linear_gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    width, height = size
    gradient = Image.new("RGBA", size)
    px = gradient.load()
    for y in range(height):
        color = blend_color(top, bottom, y / max(height - 1, 1))
        for x in range(width):
            px[x, y] = (*color, 255)
    return gradient


def radial_gradient(
    size: tuple[int, int],
    inner: tuple[int, int, int],
    outer: tuple[int, int, int],
    *,
    center: tuple[float, float] | None = None,
    radius: float | None = None,
) -> Image.Image:
    width, height = size
    cx, cy = center if center else (width / 2, height / 2)
    final_radius = radius if radius else min(width, height) / 2
    gradient = Image.new("RGBA", size)
    px = gradient.load()
    for y in range(height):
        for x in range(width):
            distance = math.hypot(x - cx, y - cy)
            t = min(distance / final_radius, 1)
            color = blend_color(inner, outer, t)
            px[x, y] = (*color, 255)
    return gradient


def apply_mask(image: Image.Image, mask: Image.Image) -> Image.Image:
    result = Image.new("RGBA", image.size)
    result.paste(image, (0, 0), mask)
    return result


def draw_shadow(base: Image.Image, box: tuple[int, int, int, int], radius: int, alpha: int) -> None:
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    draw.rounded_rectangle(box, radius=radius, fill=(0, 0, 0, alpha))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    base.alpha_composite(shadow)


def create_pin_mask(size: tuple[int, int], scale: float = 1.0) -> Image.Image:
    width, height = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)

    cx = width // 2
    top = int(115 * scale)
    bottom = int(915 * scale)
    circle_left = int(142 * scale)
    circle_top = top
    circle_right = width - circle_left
    circle_bottom = int(738 * scale)
    triangle_top = int(566 * scale)

    draw.ellipse((circle_left, circle_top, circle_right, circle_bottom), fill=255)
    draw.polygon(
        [
            (int(272 * scale), triangle_top),
            (int(width - 272 * scale), triangle_top),
            (cx, bottom),
        ],
        fill=255,
    )
    draw.ellipse((int(300 * scale), int(480 * scale), int(width - 300 * scale), int(720 * scale)), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(2))


def create_tree_scene(size: tuple[int, int]) -> Image.Image:
    width, height = size
    scene = Image.new("RGBA", size, (0, 0, 0, 0))
    scene.alpha_composite(linear_gradient(size, (241, 250, 255), (165, 217, 255)))

    horizon = Image.new("RGBA", size, (0, 0, 0, 0))
    horizon_draw = ImageDraw.Draw(horizon)
    horizon_draw.ellipse((-60, int(height * 0.68), width + 60, int(height * 1.04)), fill=(214, 244, 189, 255))
    horizon_draw.ellipse((30, int(height * 0.73), width - 30, int(height * 1.08)), fill=(132, 208, 63, 255))
    scene.alpha_composite(horizon.filter(ImageFilter.GaussianBlur(4)))

    sparkles = Image.new("RGBA", size, (0, 0, 0, 0))
    spark_draw = ImageDraw.Draw(sparkles)
    for x, y, size_hint in ((120, 160, 10), (190, 120, 14), (width - 148, 178, 11)):
        spark_draw.line((x - size_hint, y, x + size_hint, y), fill=(255, 255, 205, 180), width=3)
        spark_draw.line((x, y - size_hint, x, y + size_hint), fill=(255, 255, 205, 180), width=3)
    scene.alpha_composite(sparkles)

    trunk = Image.new("RGBA", size, (0, 0, 0, 0))
    trunk_draw = ImageDraw.Draw(trunk)
    trunk_draw.polygon(
        [
            (width * 0.46, height * 0.74),
            (width * 0.50, height * 0.44),
            (width * 0.54, height * 0.74),
            (width * 0.58, height * 0.90),
            (width * 0.52, height * 0.90),
            (width * 0.505, height * 0.80),
            (width * 0.48, height * 0.92),
            (width * 0.42, height * 0.92),
        ],
        fill=(126, 69, 19, 255),
    )
    trunk_draw.polygon(
        [
            (width * 0.50, height * 0.56),
            (width * 0.42, height * 0.42),
            (width * 0.46, height * 0.38),
            (width * 0.53, height * 0.53),
        ],
        fill=(133, 78, 24, 255),
    )
    trunk_draw.polygon(
        [
            (width * 0.51, height * 0.56),
            (width * 0.60, height * 0.42),
            (width * 0.57, height * 0.38),
            (width * 0.48, height * 0.53),
        ],
        fill=(147, 85, 26, 255),
    )
    scene.alpha_composite(trunk.filter(ImageFilter.GaussianBlur(0.6)))

    canopy = Image.new("RGBA", size, (0, 0, 0, 0))
    canopy_draw = ImageDraw.Draw(canopy)
    for ellipse_box, fill in [
        ((110, 160, 310, 330), (179, 233, 33, 255)),
        ((220, 120, 470, 330), (204, 244, 24, 255)),
        ((400, 135, 610, 330), (168, 227, 29, 255)),
        ((560, 170, 790, 360), (68, 189, 45, 255)),
        ((160, 260, 390, 470), (123, 208, 47, 255)),
        ((370, 240, 640, 500), (84, 190, 37, 255)),
        ((540, 250, 760, 475), (37, 160, 60, 255)),
        ((250, 95, 640, 285), (228, 255, 52, 120)),
    ]:
        canopy_draw.ellipse(ellipse_box, fill=fill)
    canopy = canopy.filter(ImageFilter.GaussianBlur(2))

    canopy_lights = Image.new("RGBA", size, (0, 0, 0, 0))
    light_draw = ImageDraw.Draw(canopy_lights)
    for x, y, radius in (
        (250, 220, 16),
        (330, 200, 13),
        (510, 220, 12),
        (620, 300, 11),
        (300, 340, 10),
        (460, 360, 12),
    ):
        light_draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(236, 255, 170, 90))
    canopy.alpha_composite(canopy_lights)
    scene.alpha_composite(canopy)

    grass = Image.new("RGBA", size, (0, 0, 0, 0))
    grass_draw = ImageDraw.Draw(grass)
    grass_draw.ellipse((90, 760, 360, 960), fill=(113, 201, 59, 255))
    grass_draw.ellipse((280, 760, 720, 990), fill=(94, 182, 47, 255))
    grass_draw.ellipse((600, 780, 850, 970), fill=(120, 208, 67, 255))
    for base_x, base_y, height_px in (
        (170, 835, 70),
        (225, 822, 96),
        (315, 830, 82),
        (650, 845, 68),
        (710, 828, 92),
    ):
        grass_draw.polygon(
            [
                (base_x - 24, base_y),
                (base_x, base_y - height_px),
                (base_x + 18, base_y),
            ],
            fill=(151, 229, 67, 230),
        )
    scene.alpha_composite(grass.filter(ImageFilter.GaussianBlur(1)))
    return scene


def create_pin_art(size: tuple[int, int]) -> Image.Image:
    width, height = size
    art = Image.new("RGBA", size, (0, 0, 0, 0))

    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse((210, 864, 810, 972), fill=(0, 0, 0, 45))
    art.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))

    pin_mask = create_pin_mask(size)
    pin_fill = linear_gradient(size, (186, 243, 18), (0, 139, 52))
    pin = apply_mask(pin_fill, pin_mask)
    art.alpha_composite(pin)

    highlight_mask = Image.new("L", size, 0)
    highlight_draw = ImageDraw.Draw(highlight_mask)
    highlight_draw.ellipse((160, 170, 560, 655), fill=225)
    highlight_draw.polygon([(245, 600), (510, 600), (430, 840)], fill=225)
    highlight_mask = ImageChops.multiply(highlight_mask, pin_mask).filter(ImageFilter.GaussianBlur(18))
    highlight_fill = linear_gradient(size, (255, 255, 220), (255, 255, 255))
    highlight = apply_mask(highlight_fill, highlight_mask)
    highlight.putalpha(highlight_mask.point(lambda value: int(value * 0.24)))
    art.alpha_composite(highlight)

    ring = Image.new("RGBA", size, (0, 0, 0, 0))
    ring_draw = ImageDraw.Draw(ring)
    ring_draw.ellipse((210, 190, 814, 794), fill=(255, 255, 255, 255))
    ring_draw.ellipse((238, 218, 786, 766), fill=(0, 0, 0, 0))
    ring = ring.filter(ImageFilter.GaussianBlur(0.4))
    art.alpha_composite(ring)

    scene_mask = Image.new("L", size, 0)
    scene_mask_draw = ImageDraw.Draw(scene_mask)
    scene_mask_draw.ellipse((245, 225, 779, 759), fill=255)
    scene = create_tree_scene(size)
    scene = apply_mask(scene, scene_mask)
    art.alpha_composite(scene)

    inner_ring = Image.new("RGBA", size, (0, 0, 0, 0))
    inner_ring_draw = ImageDraw.Draw(inner_ring)
    inner_ring_draw.ellipse((248, 228, 776, 756), outline=(115, 185, 55, 190), width=8)
    art.alpha_composite(inner_ring)

    return art


def create_card_background(size: tuple[int, int]) -> Image.Image:
    width, height = size
    card = Image.new("RGBA", size, (0, 0, 0, 0))
    draw_shadow(card, (90, 74, width - 90, height - 88), 132, 50)

    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((82, 62, width - 82, height - 82), radius=132, fill=255)
    fill = linear_gradient(size, (255, 255, 255), (245, 248, 242))
    card.alpha_composite(apply_mask(fill, mask))

    border = Image.new("RGBA", size, (0, 0, 0, 0))
    border_draw = ImageDraw.Draw(border)
    border_draw.rounded_rectangle(
        (82, 62, width - 82, height - 82),
        radius=132,
        outline=(231, 236, 229, 255),
        width=4,
    )
    card.alpha_composite(border)
    return card


def create_app_icon() -> Image.Image:
    canvas = create_card_background((SIZE, SIZE))
    pin = create_pin_art((SIZE, SIZE)).resize((820, 820), Image.Resampling.LANCZOS)
    canvas.alpha_composite(pin, dest=(102, 128))
    return canvas


def create_android_background() -> Image.Image:
    background = radial_gradient((SIZE, SIZE), (246, 253, 240), (214, 238, 202), center=(512, 430), radius=760)
    soft = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
    draw = ImageDraw.Draw(soft)
    draw.ellipse((140, 120, 884, 864), fill=(255, 255, 255, 120))
    background.alpha_composite(soft.filter(ImageFilter.GaussianBlur(40)))
    return background


def create_foreground_icon() -> Image.Image:
    foreground = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pin = create_pin_art((SIZE, SIZE))
    pin = pin.resize((840, 840), Image.Resampling.LANCZOS)
    foreground.alpha_composite(pin, dest=(92, 118))
    return foreground


def create_splash_icon() -> Image.Image:
    splash = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pin = create_pin_art((SIZE, SIZE)).resize((760, 760), Image.Resampling.LANCZOS)
    splash.alpha_composite(pin, dest=(132, 146))
    return splash


def create_monochrome_icon() -> Image.Image:
    icon = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    mask = create_pin_mask((SIZE, SIZE))
    fill = Image.new("RGBA", (SIZE, SIZE), (22, 72, 32, 255))
    icon.alpha_composite(apply_mask(fill, mask))

    cutout = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(cutout)
    draw.ellipse((290, 280, 735, 725), fill=255)
    draw.rectangle((470, 500, 555, 735), fill=255)
    draw.ellipse((325, 335, 700, 610), fill=255)
    cutout = cutout.filter(ImageFilter.GaussianBlur(6))

    icon.putalpha(ImageChops.subtract(icon.getchannel("A"), cutout))
    solid = Image.new("RGBA", (SIZE, SIZE), (24, 74, 34, 255))
    solid.putalpha(icon.getchannel("A"))
    return solid


def write_image(filename: str, image: Image.Image, size: tuple[int, int] | None = None) -> None:
    target = IMAGES_DIR / filename
    output = image
    if size:
        output = image.resize(size, Image.Resampling.LANCZOS)
    output.save(target)


def main() -> None:
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    app_icon = create_app_icon()
    android_background = create_android_background()
    android_foreground = create_foreground_icon()
    splash_icon = create_splash_icon()
    monochrome_icon = create_monochrome_icon()

    write_image("icon.png", app_icon)
    write_image("favicon.png", app_icon, (64, 64))
    write_image("splash-icon.png", splash_icon)
    write_image("android-icon-background.png", android_background)
    write_image("android-icon-foreground.png", android_foreground)
    write_image("android-icon-monochrome.png", monochrome_icon)
    write_image("app-icon-preview.png", app_icon, (512, 512))

    print("Icons generated in", IMAGES_DIR)


if __name__ == "__main__":
    main()
