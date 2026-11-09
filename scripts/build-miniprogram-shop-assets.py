#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从现行 H5 商城派生资源生成小程序主包内素材。

来源：xcwc-web/dist/assets/shop/**（现行 H5 派生 WebP）
目标：xcwc-web/miniprogram/assets/shop/**
原因：小程序主包 2MB 上限；原始 felt / cover / detail 合计约 4MB，
      详情长图含旧价格与「加入购物车」画面且本分支不做购买，不搬入。
"""
import json
import os
from PIL import Image, ImageDraw

ROOT = '/Users/beluga/Code/xcwc/xcwc-web'
DIST = os.path.join(ROOT, 'dist')
MP = os.path.join(ROOT, 'miniprogram', 'assets', 'shop')
CATALOG = '/Users/beluga/Code/xcwc/xcwc-api/src/main/resources/shop/catalog.json'


def derive(src, dst, width, quality):
    im = Image.open(src)
    if im.width > width:
        height = round(im.height * width / im.width)
        im = im.resize((width, height), Image.LANCZOS)
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
    im.save(dst, 'WEBP', quality=quality, method=6)
    return im.size, os.path.getsize(dst)


def main():
    targets = {
        'felt/pink-pill.webp': ('assets/shop/felt/pink-pill-800.webp', 600, 72),
        'felt/card.webp': ('assets/shop/felt/card-560.webp', 400, 74),
        'felt/cream-panel.webp': ('assets/shop/felt/cream-panel-900.webp', 450, 70),
        'felt/green-button.webp': ('assets/shop/felt/green-button-720.webp', 480, 72),
    }
    report = []
    for dst_name, (src_rel, width, quality) in targets.items():
        src = os.path.join(DIST, src_rel)
        dst = os.path.join(MP, dst_name)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        size, n = derive(src, dst, width, quality)
        report.append((dst_name, src_rel, size, n))

    catalog = json.load(open(CATALOG, encoding='utf-8'))
    # 轮播：按 catalog.json 中 enabled 的 banner，与 H5 实际读取一致
    os.makedirs(os.path.join(MP, 'banners'), exist_ok=True)
    for i, banner in enumerate(catalog['banners']):
        if not banner.get('enabled', True):
            continue
        src = os.path.join(DIST, banner['imageUrl'].lstrip('/'))
        dst = os.path.join(MP, 'banners', 'banner-%d.webp' % (i + 1))
        size, n = derive(src, dst, 750, 78)
        report.append((os.path.relpath(dst, MP), banner['imageUrl'].lstrip('/'), size, n))

    os.makedirs(os.path.join(MP, 'covers'), exist_ok=True)
    for p in catalog['products']:
        if not p.get('enabled', True):
            continue
        src = os.path.join(DIST, p['coverImageUrl'].lstrip('/'))
        dst = os.path.join(MP, 'covers', p['id'] + '.webp')
        size, n = derive(src, dst, 480, 72)
        report.append((os.path.relpath(dst, MP), p['coverImageUrl'].lstrip('/'), size, n))

    # 线性图标：WXSS 不支持本地 background-image，用透明 PNG 由 image 组件承载
    icons = os.path.join(MP, 'icons')
    os.makedirs(icons, exist_ok=True)

    def new_canvas():
        im = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
        return im, ImageDraw.Draw(im)

    # bird：圆头 + 身体 + 眼 + 喙 + 翅膀
    im, d = new_canvas()
    c = (143, 174, 98, 255)
    d.ellipse((26, 18, 66, 58), outline=c, width=5)
    d.ellipse((33, 49, 72, 84), outline=c, width=5)
    d.ellipse((47, 33, 51, 37), fill=c)
    d.polygon([(66, 40), (80, 45), (66, 50)], fill=c)
    d.arc((30, 44, 56, 72), 250, 40, fill=c, width=4)
    d.line([(40, 82), (40, 92)], fill=c, width=4)
    d.line([(59, 80), (59, 92)], fill=c, width=4)
    im.save(os.path.join(icons, 'bird.png'))
    report.append(('icons/bird.png', 'generated', (96, 96), os.path.getsize(os.path.join(icons, 'bird.png'))))

    # cart：车篮 + 把手 + 两轮
    im, d = new_canvas()
    c = (176, 120, 66, 255)
    d.line([(8, 14), (20, 14), (32, 62), (84, 62)], fill=c, width=5, joint='curve')
    d.line([(32, 30), (88, 30), (84, 62)], fill=c, width=5)
    d.line([(8, 14), (14, 20)], fill=c, width=5)
    d.ellipse((38, 72, 50, 84), outline=c, width=5)
    d.ellipse((70, 72, 82, 84), outline=c, width=5)
    im.save(os.path.join(icons, 'cart.png'))
    report.append(('icons/cart.png', 'generated', (96, 96), os.path.getsize(os.path.join(icons, 'cart.png'))))

    # cart-white：同一线稿换成浅奶白色，供商品卡绿色圆钮内使用。
    white = Image.new('RGBA', im.size, (0, 0, 0, 0))
    src_px = im.load()
    out_px = white.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = src_px[x, y]
            if a:
                out_px[x, y] = (255, 253, 229, a)
    white.save(os.path.join(icons, 'cart-white.png'))
    report.append(('icons/cart-white.png', 'generated', (96, 96), os.path.getsize(os.path.join(icons, 'cart-white.png'))))

    # 「全部小鸟」分类图标与网页端 template.html 的 happy-192.webp 同源。
    happy_src = os.path.join(DIST, 'assets/optimized/nest/felt/emotions/happy-192.531def933d70.webp')
    happy = Image.open(happy_src).convert('RGBA')
    happy.thumbnail((96, 96), Image.LANCZOS)
    happy_dst = os.path.join(icons, 'happy.webp')
    happy.save(happy_dst, 'WEBP', quality=80, method=6)
    report.append(('icons/happy.webp', 'assets/optimized/nest/felt/emotions/happy-192.531def933d70.webp',
                   happy.size, os.path.getsize(happy_dst)))

    for name, src, size, n in report:
        print('%-32s %-10s %8d B  %s' % (name, '%dx%d' % size, n, src))
    print('derived total: %.1f KB' % (sum(r[3] for r in report) / 1024))
    print('products:', sum(1 for p in catalog['products'] if p.get('enabled', True)))


if __name__ == '__main__':
    main()
