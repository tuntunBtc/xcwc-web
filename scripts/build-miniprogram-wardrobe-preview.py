#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""小程序衣橱页 → 自包含浏览器预览（仅版式/文案/交互校对，不进小程序包）。

- 视口默认 390px，rpx→px 系数 = WIDTH/750，与网页端 390px 基线同宽。
- WXSS 直接读取并换算；所有素材内联 data URI，file:// 打开也不破图。
- WXML 结构按标签逐个映射为等价 HTML（结构与数据来自真实 wxml / catalog）。
- <tab-bar /> 展开为 custom-tab-bar 的真实结构，高亮小窝（与 H5 衣橱页一致）。
- ?test=1 跑交互断言，配合 --dump-dom 读取 #test-out。

用法：python3 scripts/build-miniprogram-wardrobe-preview.py [WIDTH]
"""
import base64
import io
import json
import os
import re
import sys

ROOT = '/Users/beluga/Code/xcwc/xcwc-web'
MP = os.path.join(ROOT, 'miniprogram')
PAGE = os.path.join(MP, 'pages/wardrobe')
WARDROBE = os.path.join(MP, 'assets/wardrobe')
NAV = os.path.join(MP, 'assets/navigation/plush')
OUT_DIR = os.path.join(ROOT, 'output', 'miniprogram-wardrobe-preview')

WIDTH = int(sys.argv[1]) if len(sys.argv) > 1 else 390
SCALE = WIDTH / 750.0
OUT = os.path.join(OUT_DIR, 'index.html' if WIDTH == 390 else 'index-%d.html' % WIDTH)

SKINS = [
    ('huangying_osmanthus', '桂花披风', 'osmanthus'),
    ('huangying_peach', '桃花披风', 'peach'),
    ('huangying_bamboo', '竹影披风', 'bamboo'),
    ('huangying_sakura', '樱花披风', 'sakura'),
    ('huangying_scholar', '江南书生', 'scholar'),
    ('huangying_moon', '月白花嫁', 'moon'),
    ('huangying_jade', '青蛇仙子', 'jade'),
    ('huangying_pilgrim', '小小行者', 'pilgrim'),
]


def data_uri(path):
    ext = 'png' if path.endswith('.png') else 'webp'
    with open(path, 'rb') as f:
        return 'data:image/%s;base64,%s' % (ext, base64.b64encode(f.read()).decode('ascii'))


def css_from_wxss():
    text = io.open(os.path.join(PAGE, 'wardrobe.wxss'), encoding='utf-8').read()
    return re.sub(r'(-?\d+(?:\.\d+)?)rpx', lambda m: '%gpx' % (float(m.group(1)) * SCALE), text)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    uri = lambda p: data_uri(os.path.join(WARDROBE, p))
    scene_top = uri('felt/scene-top.webp')
    scene_lower = uri('felt/scene-lower.webp')
    idle = uri('felt/idle-640.webp')
    panel_head = uri('felt/panel-head.webp')
    panel_card = uri('felt/panel-card.webp')
    nav = lambda n: data_uri(os.path.join(NAV, n))

    # H5 下段用 repeat-y 无限平铺；这里按长页最大高度给足张数（同一文件会命中缓存）
    tiles = ''.join('<img class="scene-lower-tile" src="%s">' % scene_lower for _ in range(8))
    cards = []
    for i, (sid, name, slug) in enumerate(SKINS):
        cards.append(
            '<div class="outfit-card %s" data-id="%s" onclick="tapCard(this)">'
            '<img class="card-tex" src="%s">'
            '<div class="preview"><img class="preview-img" src="%s"></div>'
            '<span class="card-name">%s</span>'
            '<span class="card-desc">服装展示</span>'
            '<div class="wear is-disabled">暂未开放</div>'
            '</div>' % ('is-left' if i % 2 == 0 else 'is-right', sid,
                        panel_card, uri('huangying/%s-320.webp' % slug), name)
        )

    css = css_from_wxss()
    extra = u"""
body { margin: 0; background: #e8ebe0; font-family: -apple-system, "PingFang SC", sans-serif; }
.preview-note { max-width: @@WIDTH@@px; margin: 0 auto; padding: 10px 14px 6px; color: #5d6b4d; font-size: 11px; line-height: 1.6; }
.phone { position: relative; width: @@WIDTH@@px; margin: 0 auto 24px; overflow: hidden; background: #dceac0; box-shadow: 0 10px 40px rgba(45,60,35,.18); }
.wardrobe-page { min-height: auto; overflow: visible; }
.scene-lower-tile { display: block; width: 100%; }
image, img { border: 0; }
/* 保真映射 WXML 的 image mode：
   scaleToFill -> object-fit:fill；aspectFit -> contain；widthFix -> height:auto。
   小程序 image 组件内部即按这些规则绘制，静态预览需显式补齐。 */
.scene-top, .head-tex, .note-tex, .card-tex, .local-tex { object-fit: fill; }
.scene-lower-tile, .actor { height: auto; display: block; }
.preview-img { object-fit: contain; }
/* WXSS 的 `.wardrobe-page view/text/image` 在小程序里是标签选择器；
   预览把 view/text 映射成 div/span，这里补上等价的 box-sizing 兜底。 */
.wardrobe-page div, .wardrobe-page span, .wardrobe-page img { box-sizing: border-box; }
.hidden { display: none !important; }
#test-out { position: fixed; left: 8px; top: 8px; z-index: 9999; max-width: 370px; padding: 8px; background: #fff; color: #222; font: 11px/1.5 monospace; white-space: pre-wrap; }
/* 展开 <tab-bar />：真机组件是 position:fixed;bottom:0，固定在视口底部，
   长页截图时只出现在首屏，与 H5 首屏底栏位置一致。 */
.tab-bar-space { width: 100%; }
.tab-bar { position: fixed; left: 50%; transform: translateX(-50%); width: @@WIDTH@@px; bottom: 0; z-index: 10; box-sizing: border-box; }
/* 长图模式：fixed 底栏在 fullPage 截图里会被画在首屏视口位置，看起来像悬在页面中部。
   仅为静态对照证据将其改为页尾 absolute；真机仍是 fixed（首屏视口图可验证）。 */
body.long-shot .tab-bar { position: absolute; left: 0; transform: none; top: auto; bottom: 0; }
.tab-bar-art { position: absolute; bottom: 0; left: 0; width: 100%; height: 100%; z-index: 0; }
.tab-bar-items { position: absolute; bottom: 0; left: 0; right: 0; height: 100%; z-index: 1; display: flex; align-items: center; padding: 0 14px; }
.tab-bar-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.tab-bar-icon { width: 30px; height: 30px; }
.tab-bar-text { color: #80502c; font-size: 13px; font-weight: 600; text-shadow: 0 1px 1px #fff3d9; }
.tab-bar-text.is-active { color: #4e8c4c; }
.toast { position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%); z-index: 9998; padding: 12px 20px; border-radius: 10px; background: rgba(0,0,0,.78); color: #fff; font-size: 14px; }
"""
    extra = extra.replace('@@WIDTH@@', str(WIDTH))

    nav_items = [
        ('小窝', 'nav-home-active.webp', True),
        ('城市', 'nav-city-default.webp', False),
        ('商城', 'nav-shop-default.webp', False),
        ('我的', 'nav-profile-default.webp', False),
    ]
    nav_html = ''.join(
        '<div class="tab-bar-item"><img class="tab-bar-icon" src="%s">'
        '<span class="tab-bar-text %s">%s</span></div>'
        % (nav(f), 'is-active' if active else '', label)
        for label, f, active in nav_items
    )

    tpl = u"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>小程序衣橱页 · 网页端对照预览 @@WIDTH@@px</title>
<style>@@CSS@@
@@EXTRA@@
</style></head><body>
<div class="preview-note">静态对照预览：WXML 结构 + WXSS 自动换算（750rpx → @@WIDTH@@px），素材为小程序真实文件。底部毛绒导航为全站自定义 tabBar 复用的示意。</div>
<pre id="test-out" class="hidden"></pre>
<div class="phone">
<div class="wardrobe-page">
    <img class="scene-top" src="@@SCENE_TOP@@">
    <div class="scene-lower">@@TILES@@</div>
    <div class="status-space" style="height:91.5px"></div>
    <div class="flow">
        <div class="back" onclick="tapBack()" id="backBtn">← 返回</div>
        <div class="hero">
            <div class="head">
                <img class="head-tex" src="@@PANEL_HEAD@@">
                <div class="head-copy">
                    <span class="eyebrow">BUJIDAO · MY ISLAND</span>
                    <span class="head-title">我的衣橱</span>
                    <span class="head-sub">服装展示 · 暂未开放</span>
                </div>
            </div>
            <img class="actor" src="@@IDLE@@">
        </div>
        <div class="note">
            <img class="note-tex" src="@@PANEL_HEAD@@">
            <span class="note-copy">换装功能本期暂未开放，服装仅作展示。</span>
        </div>
        <div class="collection">
            <div class="collection-head">
                <span class="collection-title">小黄莺的新衣</span>
                <span class="collection-count">8 套装扮</span>
            </div>
            <div class="grid">@@CARDS@@</div>
        </div>
        <div class="local-note">
            <img class="local-tex" src="@@PANEL_HEAD@@">
            <span class="local-copy">本机体验 · 无需登录；清除小程序数据或换设备后不会自动恢复。</span>
        </div>
    </div>
    <div class="tab-bar-space" style="height:77.5px"></div>
    <div class="tab-bar" style="height:77.5px">
        <img class="tab-bar-art" src="@@NAV_BG@@">
        <div class="tab-bar-items">@@NAV_ITEMS@@</div>
    </div>
</div>
<div id="toast" class="toast hidden"><span id="toastText"></span></div>
<script>
var toastTimer = null, changed = 0;
function showToast(text) {
  var t = document.getElementById('toast');
  document.getElementById('toastText').textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 1800);
}
function tapCard(el) { changed++; showToast('换装功能本期暂未开放'); }
function tapBack() { showToast('返回上一页'); }
function runTest() {
  var out = [], ok = true;
  function t(name, cond) { out.push((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) ok = false; }
  t('8 cards', document.querySelectorAll('.outfit-card').length === 8);
  t('text 我的衣橱', document.querySelector('.head-title').textContent === '我的衣橱');
  t('text 服装展示 · 暂未开放', document.querySelector('.head-sub').textContent === '服装展示 · 暂未开放');
  t('text note', document.querySelector('.note-copy').textContent === '换装功能本期暂未开放，服装仅作展示。');
  t('text 8 套装扮', document.querySelector('.collection-count').textContent === '8 套装扮');
  t('8 disabled wear', document.querySelectorAll('.wear.is-disabled').length === 8);
  t('all wear 暂未开放', Array.from(document.querySelectorAll('.wear')).every(function (e) { return e.textContent === '暂未开放'; }));
  t('4 tabbar items', document.querySelectorAll('.tab-bar-item').length === 4);
  t('小窝 active', document.querySelector('.tab-bar-text.is-active').textContent === '小窝');
  t('no broken images', Array.from(document.images).every(function (i) { return i.complete && i.naturalWidth > 0; }));
  var first = document.querySelector('.outfit-card');
  first.click();
  t('toast on card tap', !document.getElementById('toast').classList.contains('hidden'));
  t('toast copy', document.getElementById('toastText').textContent === '换装功能本期暂未开放');
  t('card tap is read-only', changed === 1 && document.querySelectorAll('.outfit-card').length === 8);
  var el = document.getElementById('test-out');
  el.classList.remove('hidden');
  el.textContent = out.join('\\n') + '\\nRESULT=' + (ok ? 'PASS' : 'FAIL');
}
var params = new URLSearchParams(location.search);
if (params.get('test') === '1') {
  window.addEventListener('load', function () { setTimeout(runTest, 350); });
}
if (params.get('long') === '1') { document.body.classList.add('long-shot'); }
</script>
</body></html>"""

    replacements = {
        '@@CSS@@': css, '@@EXTRA@@': extra, '@@WIDTH@@': str(WIDTH),
        '@@SCENE_TOP@@': scene_top, '@@TILES@@': tiles, '@@IDLE@@': idle,
        '@@PANEL_HEAD@@': panel_head, '@@PANEL_CARD@@': panel_card,
        '@@CARDS@@': ''.join(cards), '@@NAV_BG@@': nav('nav-background.webp'),
        '@@NAV_ITEMS@@': nav_html,
    }
    for key, value in replacements.items():
        tpl = tpl.replace(key, value)
    with io.open(OUT, 'w', encoding='utf-8') as f:
        f.write(tpl)
    print('%s  %.1f KB' % (OUT, os.path.getsize(OUT) / 1024.0))


if __name__ == '__main__':
    main()
