#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成小程序「我的」页背景 WebP 派生文件。

来源为网页端原始 PNG（assets/profile/felt/background-v1.png），不改动原始素材，
也不二次压缩网页端已发布的 WebP；独立派生的尺寸与比例与 H5 保持一致。
需要 Pillow：python3 -m pip install Pillow
"""
import hashlib
import io
import os

from PIL import Image

ROOT = '/Users/beluga/Code/xcwc/xcwc-web'
SRC = os.path.join(ROOT, 'assets/profile/felt/background-v1.png')
OUT_DIR = os.path.join(ROOT, 'miniprogram/assets/profile/felt')
OUT = os.path.join(OUT_DIR, 'background.webp')

# 主视觉/背景预算 100–250 KB；q90/method6 在 852×1846 下约 248 KB，
# 保留毛绒质感与中文以外的插画细节，不再做有损二次压缩。
QUALITY = 90


def sha256(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with Image.open(SRC) as image:
        source = image.convert('RGB')
        size = source.size
        source.save(OUT, 'WEBP', quality=QUALITY, method=6)
    with open(OUT, 'rb') as handle:
        data = handle.read()
    print('source      : %s (%s, %d KB)' % (SRC, size, os.path.getsize(SRC) // 1024))
    print('derived     : %s (%d x %d, %d KB, q=%d)' % (OUT, size[0], size[1], len(data) // 1024, QUALITY))
    print('derived sha : %s' % sha256(OUT))
    print('original png sha: %s' % sha256(SRC))
    if len(data) > 250 * 1024:
        raise SystemExit('background.webp exceeds the 250 KB main-visual budget')


if __name__ == '__main__':
    main()
