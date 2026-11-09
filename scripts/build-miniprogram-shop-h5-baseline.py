#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用网页端 src/shop 的真实 CSS + 模板结构生成 390px 基线页（不依赖 API）。

用于与小程序预览逐项比对；?measure=1 输出关键区块几何与字号。
"""
import base64
import io
import json
import os
import re

ROOT = '/Users/beluga/Code/xcwc/xcwc-web'
DIST = os.path.join(ROOT, 'dist')
CATALOG = '/Users/beluga/Code/xcwc/xcwc-api/src/main/resources/shop/catalog.json'
OUT_DIR = os.path.join(ROOT, 'output', 'miniprogram-shop-preview')
OUT = os.path.join(OUT_DIR, 'h5-baseline.html')


def uri(rel):
    p = os.path.join(DIST, rel.lstrip('/'))
    with open(p, 'rb') as f:
        return 'data:image/webp;base64,' + base64.b64encode(f.read()).decode('ascii')


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    css = io.open(os.path.join(ROOT, 'src/shop/shop.css'), encoding='utf-8').read()
    for rel in set(re.findall(r'__XCWC_ASSET_ORIGIN__(/assets/[\w\-./]+\.webp)', css)):
        css = css.replace('__XCWC_ASSET_ORIGIN__' + rel, uri(rel))
    css = css.replace(':host {', '.shop-root {').replace(':host{', '.shop-root{')
    # 手机基线固定 390px：移除桌面(>=600px)与小屏(<=360px)媒体分支，
    # 保证 --screenshot 与 --dump-dom（viewport 可能不同）测到同一套值。
    css = '\n'.join(
        line for line in css.split('\n')
        if not line.startswith('@media(min-width:600px)') and not line.startswith('@media(max-width:360px)')
    )
    css += '\n.shop-root { width: 390px; margin: 0 auto; }\nbody { margin: 0; background: #e8ebe0; }\n'

    catalog = json.load(open(CATALOG, encoding='utf-8'))
    cards = []
    for p in catalog['products']:
        if p.get('enabled', True) is False:
            continue
        cards.append(
            '<article class="card">'
            '<button class="photo-button" type="button"><img class="photo" src="@@COVER@@" alt="@@TITLE@@"></button>'
            '<div class="card-body"><h2>@@TITLE@@</h2><p class="remark">@@REMARK@@</p>'
            '<div class="card-bottom"><span class="price">¥@@PRICE@@</span>'
            '<button class="add" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="#cart"/></svg></button>'
            '</div></div></article>'
            .replace('@@COVER@@', uri(p['coverImageUrl']))
            .replace('@@TITLE@@', p['title'])
            .replace('@@REMARK@@', p.get('remark', ''))
            .replace('@@PRICE@@', '%g' % p['price'])
        )
    banner = uri(catalog['banners'][0]['imageUrl'])
    happy = uri('/assets/optimized/nest/felt/emotions/happy-192.531def933d70.webp')

    tpl = u"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>网页端商城基线 390px</title>
<style>@@CSS@@</style></head><body>
<pre id="measure-out" class="hidden" style="position:fixed;left:8px;top:8px;z-index:9999;background:#fff;font:11px monospace;white-space:pre-wrap"></pre>
<div class="shop-root">
<svg class="shop-symbols" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><symbol id="cart" viewBox="0 0 24 24"><path d="m3 3 2 1 3 12h10l3-9H6M9 21h.01M18 21h.01"/></symbol></svg>
<div class="app">
<header class="masthead">
<div class="brand"><span class="brand-mark"><svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M19 10a7 7 0 1 1-13-3c0-5 7-6 9-2l5 2-3 2M9 13c1 2 3 3 5 1M8 21v-3m6 3v-3"/><circle cx="12.5" cy="6" r=".5"/></svg></span><div>小鸟商城<small>BIRD CITY DIARY</small></div></div>
<button class="cart-icon" type="button"><svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><use href="#cart"/></svg><span class="count" hidden>0</span></button>
</header>
<section class="hero"><div class="slides"><img class="slide active" src="@@BANNER@@" alt=""></div></section>
<section class="intro"><div class="intro-copy"><p class="eyebrow">A LITTLE BIRD, A NEW JOURNEY</p><h1>把一座城市，带回家。</h1><p class="intro-description">遇见城市限定小鸟，收藏属于你的旅行记忆</p></div><div class="intro-stamp"><span>城市限定<br>温暖相伴</span><i class="stamp-leaf"></i></div></section>
<div class="benefit"><span class="egg-art">🥚</span><b>绑定实体小鸟，解锁对应城市鸟蛋</b><button type="button">了解规则 <span>›</span></button></div>
<section class="toolbar"><div class="category"><strong><img src="@@HAPPY@@" alt="" width="28" height="28">全部小鸟</strong><span>共 @@COUNT@@ 只城市小鸟</span></div>
<div class="filters"><button class="filter active" id="defaultSort" type="button">综合排序</button><button class="filter" id="priceSort" type="button">价格 ↕</button><div class="filter city-filter"><select><option>全部城市</option></select><span>▾</span></div></div></section>
<main class="products">@@CARDS@@</main>
<div class="end">一鸟一城 · 旅途未完待续</div>
</div></div>
<script>
const params = new URLSearchParams(location.search);
if (params.get('measure') === '1') {
    const selectors = ['.app', '.masthead', '.hero', '.intro', '.benefit', '.toolbar', '.category',
        '.filters', '.filter', '.products', '.card', '.photo', '.card-body', '.card h2',
        '.remark', '.price', '.add', '.end'];
    const rects = {};
    selectors.forEach(s => {
        const el = document.querySelector(s);
        if (!el) return;
        const r = el.getBoundingClientRect();
        rects[s] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    });
    const fonts = {};
    ['.brand', '.intro h1', '.intro-description', '.eyebrow', '.benefit', '.category strong',
     '.category > span', '.filter', '.card h2', '.remark', '.price', '.end'].forEach(s => {
        const el = document.querySelector(s);
        if (el) fonts[s] = getComputedStyle(el).fontSize;
    });
    const out = document.getElementById('measure-out');
    out.textContent = '@@MEASURE@@' + JSON.stringify({ rects: rects, fonts: fonts }) + '@@END@@';
    out.style.display = 'block';
}
</script>
</body></html>
"""
    html = tpl
    for key, value in (
        ('@@CSS@@', css), ('@@BANNER@@', banner), ('@@HAPPY@@', happy),
        ('@@COUNT@@', str(len(cards))), ('@@CARDS@@', '\n'.join(cards)),
    ):
        html = html.replace(key, value)
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('written', OUT, '%.1f KB' % (len(html.encode('utf-8')) / 1024))


if __name__ == '__main__':
    main()
