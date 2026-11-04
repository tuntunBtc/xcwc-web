#!/usr/bin/env python3
"""Create purpose-sized Huangying WebP files; keep library originals untouched.

Optional --transparent-source accepts the reviewed background-removed happy bird.
It is never used as a source for the white card/avatar variants.
"""
from pathlib import Path
import argparse
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT.parent / '小鸟资料库' / '小黄莺'
OUTPUT = ROOT / 'assets' / 'birds' / 'huangying'


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export_variant(source, filename, width, quality, square=False, require_alpha=False):
    image = Image.open(source)
    if require_alpha and ('A' not in image.getbands() or image.getchannel('A').getextrema()[0] == 255):
        raise ValueError('Reviewed transparent source must have a real alpha channel')
    mode = 'RGBA' if 'A' in image.getbands() else 'RGB'
    image = image.convert(mode)
    # Downsize only, with the whole approved image retained (no content crop).
    target_width = min(width, image.width)
    target_height = max(1, round(image.height * target_width / image.width))
    image = image.resize((target_width, target_height), Image.Resampling.LANCZOS)
    if square:
        canvas = Image.new(mode, (width, width), (255, 255, 255, 255) if mode == 'RGBA' else (255, 255, 255))
        canvas.paste(image, ((width-image.width)//2, (width-image.height)//2))
        image = canvas
    output = OUTPUT / filename
    image.save(output, 'WEBP', quality=quality, method=6, exact=True)
    decoded = Image.open(output)
    return {
        'file': filename,
        'width': decoded.width,
        'height': decoded.height,
        'bytes': output.stat().st_size,
        'source': str(source),
        'source_bytes': source.stat().st_size,
        'source_sha256': sha256(source),
        'sha256': sha256(output),
        'alpha': 'A' in decoded.getbands(),
        'quality': quality,
        'resampling': 'Lanczos; no upscaling; whole image preserved',
        'reduction_percent': round((1-output.stat().st_size/source.stat().st_size)*100, 2),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--transparent-source', type=Path)
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    white = LIBRARY / '小黄莺_开心.webp'
    records = [
        export_variant(white, 'happy-avatar-192.webp', 192, 80, square=True),
        export_variant(white, 'happy-card-400.webp', 400, 84),
    ]
    if args.transparent_source:
        records += [
            export_variant(args.transparent_source, 'happy-hero-640.webp', 640, 84, require_alpha=True),
        ]
    report = {
        'source_policy': 'Do not modify originals. White variants use the current library happy WebP. Transparent variants use only reviewed cutout source.',
        'format': 'WebP lossy, stripped incidental metadata, exact alpha preservation',
        'variants': records,
        'total_bytes': sum(record['bytes'] for record in records),
    }
    (OUTPUT / 'asset-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    rows = '\n'.join(f"| {record['file']} | {record['width']} × {record['height']} | {record['bytes'] / 1024:.2f} KB | {'透明' if record['alpha'] else '保留白底'} |" for record in records)
    readme = '''# 第一版小黄莺网页素材

来源：`/Users/beluga/Code/xcwc/小鸟资料库/小黄莺/小黄莺_开心.webp`。

选用“开心”作为默认角色，因为它是完整站姿、绿叶冠与黄绿配色清晰，适合头像、静态展示和兼容页面主角。饥饿为趴地并带饭碗气泡，害羞带心形，大哭/生气/难受等具有明确情绪用途；第一版静态换图不批量预加载这些表情，也不把它们当同一站姿混用。

原资料库现行 WebP/PNG 均为 RGB 白底，不含透明通道。白底衍生直接等比缩小原图；头像补齐白色正方形以适配圆形头像，保留完整叶冠和脚。透明主角色仅从单独复核的去背景衍生源导出，不用简单白色阈值误伤奶白色肚皮。

## 当前导出

| 文件 | 像素尺寸 | 大小 | 背景 |
| --- | --- | ---: | --- |
''' + rows + f'''

总计 **{report['total_bytes'] / 1024:.2f} KB**。尺寸与压缩值会随复核透明源而变化，以 `asset-report.json` 为机器可读依据。WebP 为按用途缩放后的有损网页版本，不宣称原尺寸无损；白底原件 1,397,820 字节不直接作为小头像网络资源。

## 性能使用

- `happy-avatar-192.webp` 用于头像、切鸟列表等小尺寸场景；不把高清原图用于几十像素头像。
- `happy-card-400.webp` 用于白底商品图、静态展示。
- 若导出，`happy-hero-640.webp` 用于兼容页面的透明主角色，不替代保留白底的头像版本。
- 同一资源使用同一外链 URL，借用浏览器缓存；不要在多个页面重复 base64 内联。
- 首屏只加载当前所需的“开心”图，其他表情按实际交互需要再加载；不用一次预加载全目录。
- 原始库、历史版本及高清输入不复制到普通发布资源目录。本目录只存实际网页变体与说明。

## 重新生成

```sh
python3 scripts/prepare-huangying-assets.py
python3 scripts/prepare-huangying-assets.py --transparent-source /absolute/path/to/reviewed-cutout.png
```

脚本不修改源文件，不重绘角色，不改配色；使用 Lanczos 缩小、WebP `method=6` 编码，头像质量 80，其他变体质量 84。可选透明源必须含非全不透明 alpha。报告记录每个输入及输出的 SHA-256、字节和像素尺寸。
'''
    (OUTPUT / 'README.md').write_text(readme, encoding='utf-8')
    for record in records:
        print(record['file'], f"{record['width']}x{record['height']}", record['bytes'], 'bytes', 'alpha' if record['alpha'] else 'white RGB')


if __name__ == '__main__':
    main()
