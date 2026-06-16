from __future__ import annotations

import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path("/Users/aaronberesford/Desktop/AEGIS")
ASSET_DIR = ROOT / "outputs/higgsfield-at30-ad/assets"
OUT_DIR = ROOT / "outputs/higgsfield-at30-ad/final"
OUT_DIR.mkdir(parents=True, exist_ok=True)

FFMPEG = ROOT / ".codex-tools/python-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1"

WIDTH = 1920
HEIGHT = 1080
FPS = 24
DURATION = 20
TOTAL_FRAMES = FPS * DURATION

LIME = (174, 255, 82)
WHITE = (246, 248, 244)
MUTED = (210, 216, 206)
BLACK = (5, 7, 6)
GRADIENT_CACHE: dict[str, Image.Image] = {}

FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size=size)


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def cover_image(img: Image.Image, progress: float, zoom_from: float, zoom_to: float, pan_from: tuple[float, float], pan_to: tuple[float, float]) -> Image.Image:
    progress = ease(progress)
    zoom = zoom_from + (zoom_to - zoom_from) * progress
    scale = max(WIDTH / img.width, HEIGHT / img.height) * zoom
    new_size = (math.ceil(img.width * scale), math.ceil(img.height * scale))
    resized = img.resize(new_size, Image.Resampling.LANCZOS)

    max_x = max(0, resized.width - WIDTH)
    max_y = max(0, resized.height - HEIGHT)
    pan_x = pan_from[0] + (pan_to[0] - pan_from[0]) * progress
    pan_y = pan_from[1] + (pan_to[1] - pan_from[1]) * progress
    left = int(max_x * (0.5 + pan_x))
    top = int(max_y * (0.5 + pan_y))
    left = max(0, min(max_x, left))
    top = max(0, min(max_y, top))
    return resized.crop((left, top, left + WIDTH, top + HEIGHT)).convert("RGBA")


def alpha_gradient(size: tuple[int, int], direction: str = "left") -> Image.Image:
    w, h = size
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    px = overlay.load()
    for y in range(h):
        for x in range(w):
            if direction == "left":
                strength = 1 - min(1, x / (w * 0.72))
            elif direction == "bottom":
                strength = max(0, (y - h * 0.4) / (h * 0.6))
            else:
                strength = 0.5
            px[x, y] = (0, 0, 0, int(205 * max(0, min(1, strength))))
    return overlay


def cached_gradient(direction: str) -> Image.Image:
    if direction not in GRADIENT_CACHE:
        GRADIENT_CACHE[direction] = alpha_gradient((WIDTH, HEIGHT), direction)
    return GRADIENT_CACHE[direction]


def draw_wrapped(draw: ImageDraw.ImageDraw, text: str, xy: tuple[int, int], typeface: ImageFont.FreeTypeFont, fill: tuple[int, int, int], max_width: int, line_gap: int = 14) -> int:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=typeface)[2] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)

    x, y = xy
    for line in lines:
        draw.text((x + 3, y + 4), line, font=typeface, fill=(0, 0, 0))
        draw.text((x, y), line, font=typeface, fill=fill)
        y += draw.textbbox((0, 0), line, font=typeface)[3] + line_gap
    return y


def draw_scene_text(frame: Image.Image, scene: dict[str, str], local_t: float) -> None:
    draw = ImageDraw.Draw(frame)
    x = 130
    y = 305
    max_width = 930

    fade = min(1, local_t / 0.45)
    if local_t > scene["duration"] - 0.55:
        fade = min(fade, max(0, (scene["duration"] - local_t) / 0.55))
    fade = ease(fade)

    def with_alpha(rgb: tuple[int, int, int]) -> tuple[int, int, int, int]:
        return (*rgb, int(255 * fade))

    # Lime marker
    marker = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    md = ImageDraw.Draw(marker)
    md.rounded_rectangle((x, y - 82, x + 190, y - 70), radius=6, fill=(*LIME, int(255 * fade)))
    frame.alpha_composite(marker)

    eyebrow = scene.get("eyebrow", "AEGIS ALLTERRAIN")
    draw.text((x, y - 132), eyebrow, font=font(30, True), fill=with_alpha(LIME))
    y = draw_wrapped(draw, scene["title"], (x, y - 58), font(74, True), with_alpha(WHITE), max_width, line_gap=16)
    y += 18
    y = draw_wrapped(draw, scene["subtitle"], (x, y), font(38, False), with_alpha(MUTED), max_width, line_gap=12)

    if scene.get("small"):
        y += 42
        draw.text((x, y), scene["small"], font=font(28, True), fill=with_alpha(LIME))


def load_logo() -> Image.Image:
    logo = Image.open(ASSET_DIR / "aegis-allterrain-logo-current.png").convert("RGBA")
    target_w = 380
    target_h = round(logo.height * target_w / logo.width)
    return logo.resize((target_w, target_h), Image.Resampling.LANCZOS)


def make_frame(images: dict[str, Image.Image], logo: Image.Image, frame_no: int) -> Image.Image:
    t = frame_no / FPS
    scenes = [
        {
            "start": 0,
            "duration": 4,
            "image": "site",
            "title": "AEGIS ALLTERRAIN AT30",
            "subtitle": "The electric rough-terrain pallet truck built for real UK sites.",
            "small": "3,000kg capacity",
            "pan_from": (-0.12, 0.0),
            "pan_to": (0.08, 0.0),
        },
        {
            "start": 4,
            "duration": 4,
            "image": "warehouse",
            "title": "MOVE PALLETS WHERE STANDARD TRUCKS STRUGGLE",
            "subtitle": "Gravel, broken tarmac, muddy yards and outdoor stock areas.",
            "small": "Electric drive. Rugged build.",
            "pan_from": (0.06, 0.0),
            "pan_to": (-0.08, 0.0),
        },
        {
            "start": 8,
            "duration": 4,
            "image": "site",
            "title": "BUILT FOR BUILDERS MERCHANTS, FARMS AND YARDS",
            "subtitle": "Designed for businesses moving pallets outside, not just on smooth warehouse floors.",
            "small": "AT30 Core | Guarded | Pilot",
            "pan_from": (0.12, 0.03),
            "pan_to": (-0.1, -0.02),
        },
        {
            "start": 12,
            "duration": 4,
            "image": "warehouse",
            "title": "A PRACTICAL STEP BETWEEN HAND PUMP TRUCKS AND FORKLIFTS",
            "subtitle": "Compact, electric, and ready for rough daily material handling.",
            "small": "AEGIS Industrial Systems",
            "pan_from": (-0.06, 0.0),
            "pan_to": (0.06, 0.0),
        },
        {
            "start": 16,
            "duration": 4,
            "image": "site",
            "title": "BOOK A DEMO",
            "subtitle": "See the AT30 series at aegis-allterrain.co.uk",
            "small": "Built for every terrain.",
            "pan_from": (-0.02, 0.0),
            "pan_to": (0.02, 0.0),
        },
    ]

    scene = scenes[-1]
    for item in scenes:
        if item["start"] <= t < item["start"] + item["duration"]:
            scene = item
            break

    local_t = t - scene["start"]
    progress = local_t / scene["duration"]
    base = cover_image(
        images[scene["image"]],
        progress,
        zoom_from=1.03,
        zoom_to=1.13,
        pan_from=scene["pan_from"],
        pan_to=scene["pan_to"],
    )
    base.alpha_composite(cached_gradient("left"))
    base.alpha_composite(cached_gradient("bottom"))

    # Subtle dark brand frame.
    draw = ImageDraw.Draw(base)
    draw.rectangle((0, 0, WIDTH, 44), fill=(BLACK[0], BLACK[1], BLACK[2], 190))
    draw.rectangle((0, HEIGHT - 32, WIDTH, HEIGHT), fill=(BLACK[0], BLACK[1], BLACK[2], 175))
    draw.rectangle((0, 42, WIDTH, 48), fill=(*LIME, 210))

    base.alpha_composite(logo, (130, 92))
    draw_scene_text(base, scene, local_t)
    return base.convert("RGB")


def main() -> None:
    images = {
        "site": Image.open(ASSET_DIR / "at30-allterrain-main.jpeg").convert("RGB"),
        "warehouse": Image.open(ASSET_DIR / "at30-yard-edition.png").convert("RGB"),
    }
    logo = load_logo()
    output = OUT_DIR / "aegis-at30-allterrain-ad-20s.mp4"
    poster = OUT_DIR / "aegis-at30-allterrain-ad-poster.jpg"

    cmd = [
        str(FFMPEG),
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{WIDTH}x{HEIGHT}",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-shortest",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        str(output),
    ]

    process = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert process.stdin is not None
    poster_frame = None
    for frame_no in range(TOTAL_FRAMES):
        frame = make_frame(images, logo, frame_no)
        if frame_no == FPS * 2:
            poster_frame = frame.copy()
        process.stdin.write(frame.tobytes())
    process.stdin.close()
    code = process.wait()
    if code != 0:
        raise SystemExit(code)
    if poster_frame:
        poster_frame.save(poster, quality=94)
    print(output)
    print(poster)


if __name__ == "__main__":
    main()
