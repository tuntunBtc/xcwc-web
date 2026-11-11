#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""小程序衣橱页素材：从当前 H5 dist 复制原图并烘焙浅色毛毡底板。

仅用于小程序工程，不改动 src/ 或 dist/。
- scene-top / scene-lower / idle-640 / 8 张服装缩略图：逐字节复制（去内容指纹改名），
  便于用 SHA-256 与网页端构建产物核对。
- panel-head / panel-card：H5 用 CSS `filter: sepia(.32) saturate(.7) brightness(1.04)`
  把 panel-720 / panel-900 的橙色底板调成奶油色；WXSS 的 filter 链在部分基础库
  表现不一致，故按 CSS Filter 等效公式烘焙成独立 WebP，避免运行时差异。

用法：python3 scripts/build-miniprogram-wardrobe-assets.py
"""
import hashlib
import io
import os
import shutil

from PIL import Image, ImageEnhance

ROOT = '/Users/beluga/Code/xcwc/xcwc-web'
DIST = os.path.join(ROOT, 'dist', 'assets')
OUT = os.path.join(ROOT, 'miniprogram', 'pages', 'wardrobe', 'assets')
FELT = os.path.join(OUT, 'felt')
SKINS = os.path.join(OUT, 'huangying')

SKIN_NAMES = ['osmanthus', 'peach', 'bamboo', 'sakura', 'scholar', 'moon', 'jade', 'pilgrim']

# (源文件, 目标文件)
COPIES = [
    (os.path.join(DIST, 'wardrobe/felt', 'scene-top-v2-900.webp'), os.path.join(FELT, 'scene-top.webp')),
    (os.path.join(DIST, 'wardrobe/felt', 'scene-lower-v2-900.webp'), os.path.join(FELT, 'scene-lower.webp')),
    (os.path.join(DIST, 'nest/felt', 'idle-640.webp'), os.path.join(FELT, 'idle-640.webp')),
]
for name in SKIN_NAMES:
    COPIES.append((
        os.path.join(DIST, 'wardrobe/huangying', name + '-320.webp'),
        os.path.join(SKINS, name + '-320.webp'),
    ))

# (源底板, 目标烘焙文件, 输出宽度)
Bakes = [
    (os.path.join(DIST, 'nest/felt', 'panel-720.webp'), os.path.join(FELT, 'panel-head.webp'), 720),
    (os.path.join(DIST, 'adopt-v1/felt', 'panel-900.webp'), os.path.join(FELT, 'panel-card.webp'), 720),
]


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def bake(src, dst, width):
    """CSS filter sepia(.32) saturate(.7) brightness(1.04) 的等效烘焙。"""
    with Image.open(src) as im:
        rgba = im.convert('RGBA')
        rgb = rgba.convert('RGB')
        # sepia() 矩阵（CSS Filter Effects 规范）
        sepia = rgb.convert('RGB', (
            0.393, 0.769, 0.189, 0.0,
            0.349, 0.686, 0.168, 0.0,
            0.272, 0.534, 0.131, 0.0,
        ))
        mixed = Image.blend(rgb, sepia, 0.32)   # sepia(.32)
        mixed = ImageEnhance.Color(mixed).enhance(0.7)        # saturate(.7)
        mixed = ImageEnhance.Brightness(mixed).enhance(1.04)  # brightness(1.04)
        if mixed.width != width:
            height = round(mixed.height * width / mixed.width)
            mixed = mixed.resize((width, height), Image.LANCZOS)
        alpha = rgba.getchannel('A')
        if alpha.size != mixed.size:
            alpha = alpha.resize(mixed.size, Image.LANCZOS)
        mixed.putalpha(alpha)
        buf = io.BytesIO()
        mixed.save(buf, 'WEBP', quality=86, method=6)
        with open(dst, 'wb') as f:
            f.write(buf.getvalue())


def main():
    os.makedirs(FELT, exist_ok=True)
    os.makedirs(SKINS, exist_ok=True)
    report = []
    for src, dst in COPIES:
        if not os.path.isfile(src):
            raise SystemExit('missing H5 asset: ' + src)
        shutil.copyfile(src, dst)
        if sha256(src) != sha256(dst):
            raise SystemExit('copy hash mismatch: ' + dst)
        report.append((os.path.relpath(dst, ROOT), os.path.getsize(dst), 'copy sha256=' + sha256(dst)[:12]))
    for src, dst, width in Bakes:
        if not os.path.isfile(src):
            raise SystemExit('missing H5 asset: ' + src)
        bake(src, dst, width)
        report.append((os.path.relpath(dst, ROOT), os.path.getsize(dst), 'baked from ' + os.path.basename(src)))
    total = sum(item[1] for item in report)
    for path, size, note in report:
        print('%-72s %7d B  %s' % (path, size, note))
    print('total %d files / %.1f KB' % (len(report), total / 1024.0))


if __name__ == '__main__':
    main()
