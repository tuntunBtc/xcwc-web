#!/usr/bin/env python3
"""Measure supplied plush navigation art and declare crops for the shared optimizer.

This script never rewrites original art or encodes a second set of media. Merge
its candidate jobs into config/media-usage.json, then run npm run media:optimize.
Pillow is needed only for this reproducible preparation/review step.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/导航栏/xcwc-ui-assets'
OUTPUT = ROOT / 'assets/navigation/plush'
ALPHA_THRESHOLD = 4
FUR_PADDING = 12


def measure(path: Path):
    with Image.open(path) as opened:
        image = opened.convert('RGBA')
        # Alpha 1-3 isolated noise covers nearly the whole source canvas. The
        # alpha >=4 envelope is stable at 8/12 too; padding retains the normal
        # translucent fringe. All RGBA pixels inside the final crop survive.
        visible = image.getchannel('A').point(lambda value: 255 if value >= ALPHA_THRESHOLD else 0).getbbox()
        if visible is None:
            raise ValueError('No visible artwork: ' + str(path))
        boxes = {str(threshold): list(image.getchannel('A').point(
            lambda value, threshold=threshold: 255 if value >= threshold else 0).getbbox())
                 for threshold in [1, 4, 8, 12, 24]}
        return {'sourceFile': path.relative_to(ROOT).as_posix(),
                'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'sourceBytes': path.stat().st_size, 'sourceSize': list(image.size),
                'alphaBounds': boxes, 'visibleBox': list(visible)}


def pad_box(box, size, square=False):
    left, top, right, bottom = box
    if square:
        side = max(right - left, bottom - top) + 2 * FUR_PADDING
        left = (left + right - side) // 2
        top = (top + bottom - side) // 2
        right, bottom = left + side, top + side
    else:
        left, top, right, bottom = left-FUR_PADDING, top-FUR_PADDING, right+FUR_PADDING, bottom+FUR_PADDING
    box = [left, top, right, bottom]
    if not (0 <= left < right <= size[0] and 0 <= top < bottom <= size[1]):
        raise ValueError('Crop exceeds source canvas: ' + str(box))
    return box


def job(record, name, crop, output_size, purpose):
    return {'id': 'nav-plush-' + name, 'sourceFile': record['sourceFile'],
            'sourceSize': record['sourceSize'], 'cropBox': crop,
            'outputSize': output_size,
            'usageUrl': '/assets/navigation/plush/' + name + '.webp',
            'outputBaseFile': 'assets/optimized/navigation/plush/' + name,
            'encoding': 'lossless-webp', 'purpose': purpose}


def main():
    records, jobs = [], []
    background = measure(SOURCE / 'nav-background.png')
    crop = pad_box(background['visibleBox'], background['sourceSize'])
    width = 960
    height = round((crop[3]-crop[1]) * width / (crop[2]-crop[0]))
    jobs.append(job(background, 'nav-background', crop, [width, height],
                    '公共底栏毛绒底板，保留两端花叶与半透明绒毛，手机约 2.2–2.6 倍分辨率'))
    jobs[-1].update(encoding='lossy-webp', quality=94)
    records.append({**background, 'cropBox': crop, 'outputSize': [width, height]})
    for item in ['home', 'city', 'shop', 'profile']:
        pair = [measure(SOURCE / 'nav-icons' / f'nav-{item}-{state}.png') for state in ['default', 'active']]
        if pair[0]['sourceSize'] != pair[1]['sourceSize']:
            raise ValueError('State canvases differ: ' + item)
        boxes = [entry['visibleBox'] for entry in pair]
        union = [min(box[0] for box in boxes), min(box[1] for box in boxes),
                 max(box[2] for box in boxes), max(box[3] for box in boxes)]
        crop = pad_box(union, pair[0]['sourceSize'], square=True)
        for state, record in zip(['default', 'active'], pair):
            jobs.append(job(record, f'nav-{item}-{state}', crop, [128,128],
                            f'公共底栏 {item} {state} 绒线图标；与同项另一状态共用联合正方形裁切框及缩放'))
            records.append({**record, 'pairUnionBox': union, 'cropBox': crop, 'outputSize': [128,128]})
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'usage-jobs.json').write_text(json.dumps({'schemaVersion': 1, 'jobs': jobs}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    audit = {'schemaVersion': 1, 'generator': 'scripts/prepare-nav-plush.py',
             'alphaThresholdForBounds': ALPHA_THRESHOLD, 'furPaddingSourcePixels': FUR_PADDING,
             'pixelPolicy': 'Only bounds ignore alpha 1-3 noise; crop/resize retains source RGBA; icons remain lossless; background uses reviewed q94 with exact alpha and >=40 dB validation.',
             'sources': records}
    (OUTPUT / 'source-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'jobs': len(jobs), 'sourceBytes': sum(record['sourceBytes'] for record in records),
                      'candidate': str((OUTPUT/'usage-jobs.json').relative_to(ROOT)),
                      'audit': str((OUTPUT/'source-audit.json').relative_to(ROOT))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
