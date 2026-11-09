#!/usr/bin/env python3
"""Derive the mini-program photo/check-in assets from the current H5 build.

Sources are the *running* H5 derivatives under assets/optimized/checkin/ and
dist/assets/checkin/ (not the historical mini-program project). Originals are
never modified. All output is written as UTF-8/ASCII-named files under
miniprogram/assets/photo/. Requires Pillow (same as the other mini-program
asset scripts).

Usage:  python3 scripts/build-miniprogram-photo-assets.py
"""

from __future__ import annotations

import hashlib
import io
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "miniprogram" / "assets" / "photo"
REPORT = ROOT / "output" / "miniprogram-photo-baseline" / "asset-manifest.json"

HERO = ROOT / "assets/optimized/checkin/felt-hero-v1.9094f1d77796.webp"
MEADOW = ROOT / "assets/optimized/checkin/felt-meadow-v1.cad083ccbe46.webp"
CREAM = ROOT / "assets/optimized/checkin/felt-cream-v1.d4d8fedd5647.webp"
BIRD = ROOT / "assets/optimized/checkin/felt-bird-v1.a251068b9658.webp"
THUMB = ROOT / "assets/optimized/checkin/felt-style-thumb-192.6862cd4b0919.webp"
LAKE = ROOT / "dist/assets/checkin/lake.jpg"
AUDIO = ROOT / "assets/audio/camera.mp3"

manifest: list[dict] = []


def record(name: str, data: bytes, source: Path, note: str) -> None:
    target = OUT / name
    target.write_bytes(data)
    manifest.append(
        {
            "file": "assets/photo/" + name,
            "bytes": len(data),
            "kib": round(len(data) / 1024, 1),
            "source": str(source.relative_to(ROOT)),
            "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "note": note,
        }
    )


def save_webp(im: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    im.save(buf, format="WEBP", quality=quality, method=6)
    return buf.getvalue()


def save_png(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def resize(im: Image.Image, width: int, mode: str | None = None) -> Image.Image:
    height = max(1, round(im.height * width / im.width))
    return im.convert(mode) if mode else im.resize((width, height), Image.LANCZOS)


def build_photos() -> None:
    # 750rpx wide hero keeps the H5 1200/950 aspect ratio.
    hero = Image.open(HERO).convert("RGB")
    record("hero.webp", save_webp(resize(hero, 750), 72), HERO, "打卡页主视觉，等比 750 宽")

    # The H5 page uses this as a repeating bottom meadow. WXSS cannot repeat a
    # local background, so one viewport-sized wallpaper is drawn behind content.
    meadow = Image.open(MEADOW).convert("RGB")
    record("meadow.webp", save_webp(resize(meadow, 750), 68), MEADOW, "页面底部毛毡草地远景")

    # A small stretched texture tile for every cream felt panel.
    cream = Image.open(CREAM).convert("RGB")
    record("cream.webp", save_webp(cream.resize((320, 320), Image.LANCZOS), 62), CREAM, "奶油毛毡面板纹理")

    # Transparent felt bird: both the bird cards and the canvas sticker.
    bird = Image.open(BIRD).convert("RGBA")
    record("bird.webp", save_webp(resize(bird, 640), 74), BIRD, "透明小鸟贴纸/头像，保留 alpha")

    # Example landscape used only before a real photo is selected.
    lake = Image.open(LAKE).convert("RGB")
    ratio = 924 / 812
    if lake.width / lake.height > ratio:
        w = round(lake.height * ratio)
        lake = lake.crop(((lake.width - w) // 2, 0, (lake.width - w) // 2 + w, lake.height))
    else:
        h = round(lake.width / ratio)
        lake = lake.crop((0, (lake.height - h) // 2, lake.width, (lake.height - h) // 2 + h))
    record("example.webp", save_webp(lake.resize((700, 615), Image.LANCZOS), 66), LAKE, "示例照片（未选图时的画布背景）")

    # H5 applies a CSS filter to one thumbnail; WXSS filter support is uneven,
    # so bake the four presets into four tiny WebP files.
    thumb = Image.open(THUMB).convert("RGB").resize((192, 192), Image.LANCZOS)
    warm = Image.blend(thumb, sepia(thumb), 0.28)
    warm = ImageEnhance.Color(warm).enhance(0.85)
    warm = ImageEnhance.Contrast(warm).enhance(0.93)
    soft = ImageEnhance.Color(thumb).enhance(0.75)
    soft = ImageEnhance.Brightness(soft).enhance(1.09)
    mono = ImageEnhance.Contrast(ImageEnhance.Color(thumb).enhance(0)).enhance(0.9)
    presets = [
        ("style-0.webp", thumb, "清新自然：无滤镜"),
        ("style-1.webp", warm, "暖阳胶片：sepia .28 / saturate .85 / contrast .93"),
        ("style-2.webp", soft, "柔和风景：saturate .75 / brightness 1.09"),
        ("style-3.webp", mono, "黑白记忆：grayscale 1 / contrast .9"),
    ]
    for name, image, note in presets:
        record(name, save_webp(image, 70), THUMB, note)


def sepia(im: Image.Image) -> Image.Image:
    """Matrix approximation of CSS sepia(1), same coefficients as the filter spec."""
    matrix = (
        0.393, 0.769, 0.189, 0,
        0.349, 0.686, 0.168, 0,
        0.272, 0.534, 0.131, 0,
    )
    return im.convert("RGB", matrix)


ICON_GREEN = (110, 132, 56, 255)
ICON_BROWN = (128, 96, 60, 255)


def icon(name: str, draw_fn) -> None:
    im = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw_fn(draw)
    record(name, save_png(im), THUMB, "按 H5 内联 SVG 线稿重绘的小图标（非用户原图）")


def build_icons() -> None:
    def leaf(d: ImageDraw.ImageDraw) -> None:
        # 叶片：沿左下→右上的中轴，两侧按 sin 曲线外扩成透镜形。
        def axis(u):
            return 9 + 30 * u, 41 - 33 * u

        width = 12
        normal_x, normal_y = 0.74, 0.67
        outline = []
        for side in (1, -1):
            seq = range(0, 21) if side == 1 else range(20, -1, -1)
            for i in seq:
                u = i / 20
                x, y = axis(u)
                bulge = width * math.sin(math.pi * u) * side
                outline.append((x + normal_x * bulge, y + normal_y * bulge))
        d.polygon(outline, fill=(209, 230, 123, 255), outline=ICON_GREEN)
        d.line((9, 41, 34, 14), fill=ICON_GREEN, width=2)
        d.line((16, 32, 26, 21), fill=ICON_GREEN, width=2)
    icon("icon-leaf.png", leaf)

    def camera(d: ImageDraw.ImageDraw) -> None:
        d.rounded_rectangle((5, 12, 43, 39), radius=5, outline=ICON_BROWN, width=3)
        d.polygon([(14, 12), (18, 7), (30, 7), (34, 12)], outline=ICON_BROWN)
        d.ellipse((17, 19, 31, 33), outline=ICON_BROWN, width=3)
    icon("icon-camera.png", camera)

    def image(d: ImageDraw.ImageDraw) -> None:
        d.rounded_rectangle((6, 7, 42, 41), radius=6, outline=ICON_GREEN, width=3)
        d.ellipse((14, 14, 21, 21), outline=ICON_GREEN, width=2)
        d.line((8, 34, 19, 25, 27, 32, 33, 27, 41, 35), fill=ICON_GREEN, width=3, joint="curve")
    icon("icon-image.png", image)

    def spark(d: ImageDraw.ImageDraw) -> None:
        d.polygon(
            [(24, 3), (28, 20), (45, 24), (28, 28), (24, 45), (20, 28), (3, 24), (20, 20)],
            fill=(233, 195, 89, 255), outline=(196, 161, 60, 255),
        )
    icon("icon-spark.png", spark)

    def download(d: ImageDraw.ImageDraw) -> None:
        d.line((24, 6, 24, 30), fill=ICON_BROWN, width=3)
        d.line((15, 22, 24, 31, 33, 22), fill=ICON_BROWN, width=3, joint="curve")
        d.line((8, 34, 8, 41, 40, 41, 40, 34), fill=ICON_BROWN, width=3)
    icon("icon-download.png", download)

    def check(d: ImageDraw.ImageDraw) -> None:
        d.line((8, 25, 19, 35, 41, 11), fill=(255, 255, 255, 255), width=5, joint="curve")
    icon("icon-check.png", check)

    def lock(d: ImageDraw.ImageDraw) -> None:
        d.rounded_rectangle((9, 21, 39, 42), radius=5, outline=(255, 255, 255, 255), width=3)
        d.arc((15, 6, 33, 27), 180, 360, fill=(255, 255, 255, 255), width=3)
        d.ellipse((22, 28, 26, 32), fill=(255, 255, 255, 255))
    icon("icon-lock.png", lock)

    def arrow(d: ImageDraw.ImageDraw) -> None:
        d.line((7, 24, 40, 24), fill=ICON_BROWN, width=3)
        d.line((31, 15, 40, 24, 31, 33), fill=ICON_BROWN, width=3, joint="curve")
    icon("icon-arrow.png", arrow)

    # H5's generate-button flower is a stack of CSS radial gradients.
    im = Image.new("RGBA", (78, 78), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for angle in range(0, 360, 72):
        rad = math.radians(angle)
        cx, cy = 39 + 17 * math.cos(rad), 39 + 17 * math.sin(rad)
        d.ellipse((cx - 12, cy - 12, cx + 12, cy + 12), fill=(250, 196, 212, 255), outline=(246, 176, 198, 255), width=2)
    d.ellipse((31, 31, 47, 47), fill=(246, 207, 97, 255))
    record("flower.png", save_png(im), THUMB, "按 H5 CSS 花朵重绘的装饰花瓣")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    build_photos()
    build_icons()
    audio = AUDIO.read_bytes()
    record("shutter.mp3", audio, AUDIO, "H5 同款咔叽快门采样，点击生成时播放")
    REPORT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(item["bytes"] for item in manifest)
    for item in manifest:
        print("%-24s %7.1f KB  %s" % (item["file"], item["kib"], item["note"]))
    print("total %.1f KB / %d files -> %s" % (total / 1024, len(manifest), OUT))


if __name__ == "__main__":
    main()
