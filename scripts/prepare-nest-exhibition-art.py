#!/usr/bin/env python3
"""Normalize the approved transparent cutout without changing its proportions.

Background extraction is performed by built-in imagegen, not by this script.
Keep the attachment, generated original and historical emotion files intact.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT.parent / '小鸟资料库/小黄莺/展会状态替换-2026-11-04'


def normalize(source, filename, report_name, art_id, visible_feet):
    target = ROOT / 'assets/nest/felt/emotions' / filename
    image = Image.open(source).convert('RGBA')
    alpha = image.getchannel('A')
    bounds = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
    if not bounds or alpha.getextrema()[0] != 0 or alpha.getextrema()[1] < 250:
        raise ValueError('Expected a transparent, opaque-inside RGBA character')
    # Ignore disconnected near-invisible pixels only when choosing the layout
    # crop. Keep a four-pixel fringe and do not threshold the retained alpha.
    bounds = (max(0, bounds[0] - 4), max(0, bounds[1] - 4),
              min(image.width, bounds[2] + 4), min(image.height, bounds[3] + 4))
    character = image.crop(bounds)
    factor = min(596 / character.width, 500 / character.height)
    size = (round(character.width * factor), round(character.height * factor))
    character = character.resize(size, Image.Resampling.LANCZOS)
    # Downsampling can turn near-zero edge pixels fully transparent. Align the
    # resulting visible silhouette, rather than that discarded padding.
    character = character.crop(character.getchannel('A').getbbox())
    canvas = Image.new('RGBA', (640, 580))
    position = ((640 - character.width) // 2, 550 - character.height)
    canvas.alpha_composite(character, position)
    canvas.save(target, 'WEBP', lossless=True, exact=True, method=6)
    decoded = Image.open(target).convert('RGBA')
    if decoded.tobytes() != canvas.tobytes():
        raise ValueError('Lossless output did not preserve the normalized image')
    report = {
        'source': str(source.relative_to(ROOT.parent)),
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'runtime': str(target.relative_to(ROOT)),
        'runtimeSha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'size': [640, 580], 'bytes': target.stat().st_size,
        'alphaBounds': list(decoded.getchannel('A').getbbox()),
        'visibleFeet': visible_feet,
        'footAreaId': art_id,
        'footAreasFile': 'src/nest/foot-hit-areas.json',
        'processing': 'Layout bbox at alpha>=8 with 4px fringe; retained alpha unchanged; one proportional downscale; transparent canvas; baseline y=550; lossless WebP. No background extraction or redraw in this script.'
    }
    (FOLDER / report_name).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


def main():
    normalize(FOLDER / 'hungry-transparent-imagegen.png', 'hungry-v2.webp', 'runtime-art.json', 'hungry', False)
    normalize(FOLDER / 'belly-transparent-imagegen.png', 'belly-v1.webp', 'belly-runtime-art.json', 'belly', True)
    normalize(FOLDER / 'angry-transparent-imagegen.png', 'angry-v2.webp', 'angry-runtime-art.json', 'angry', True)


if __name__ == '__main__':
    main()
