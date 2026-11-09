#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把小程序「我的」页 WXML/WXSS 渲染成自包含、可交互的浏览器预览页。

用途：在没有微信开发者工具时，用 390px 产品态视口与网页端 H5 截图逐项比对。
- WXML 经 HTMLParser 解析后自动转 DOM（不手写一份"看起来一样"的模板）；
- WXSS 按 390px 视口把 rpx 换算为 px 后原样注入；
- 所有素材内联 data URI，file:// 与静态服务都能打开；
- 浮层与折叠交互用少量 JS 模拟 Page.setData，便于浏览器真实点击验证。

仅用于版式与交互校对，不代表微信原生渲染结果。
"""
import base64
import io
import json
import os
import re
from html.parser import HTMLParser

ROOT = '/Users/beluga/Code/xcwc/xcwc-web'
MP = os.path.join(ROOT, 'miniprogram')
OUT_DIR = os.path.join(ROOT, 'output', 'miniprogram-profile-preview')
WXML = os.path.join(MP, 'pages/profile/profile.wxml')
WXSS = os.path.join(MP, 'pages/profile/profile.wxss')
RPX_TO_PX = 390.0 / 750.0

FILLED = {
    'topInset': 0, 'displayName': '软软小黄莺', 'birdSubtitle': '当前陪伴 · 本机保存',
    'hasBird': True, 'birdCount': 1, 'birdCode': '', 'points': 7,
    'todayPoints': 0, 'dailyLimit': 10,
    'walletVisible': False, 'resetVisible': False, 'birdsVisible': False,
    'wardrobeVisible': False, 'localNoteOpen': False, 'rulesOpen': False,
    'resetBusy': False,
    'localNoteText': '小鸟、养成、叽分和装扮仅保存在当前设备，不与云端账号同步。清除小程序数据或更换设备后不会自动恢复；请先保存重要合照。',
    'pointsRules': '首次领取初见礼 +5，仅一次；每日问候 +2；同一天给同一只小鸟喂食和添水，照料奖励 +3，每天一次。有效抚摸 +1，间隔 30 秒，本机每日最多 10 次。每日最多 3 张新原图合照各 +1，重复原图只保存、不加分。每日额度按北京时间结算，各项奖励独立计算。服装换装本期暂未开放；叽分不提供充值。',
    'resetDesc': '将删除本机的小鸟领取记录、昵称、养成状态、叽分及流水、装扮、购物车，以及相册中的原图和作品。',
    'ledger': [
        {'id': '2', 'dayText': '2026/11/9 22:37:53', 'note': '每日问候', 'amountText': '+2 叽分', 'balanceText': '变动后余额 7'},
        {'id': '1', 'dayText': '2026/11/9 22:37:53', 'note': '初见礼', 'amountText': '+5 叽分', 'balanceText': '变动后余额 5'},
    ],
    'walletVisibleSheet': True,
}
EMPTY = dict(FILLED, hasBird=False, birdCount=0, points=0, displayName='我的小伙伴',
             birdSubtitle='等待第一位小伙伴', ledger=[])

SKIP_ATTRS = {
    'wx:for', 'wx:key', 'wx:if', 'wx:else', 'wx:for-item', 'wx:for-index',
    'mode', 'hover-class', 'catchtouchmove', 'scroll-y', 'bindtouchmove',
}
TAG_MAP = {'view': 'div', 'text': 'span', 'image': 'img', 'scroll-view': 'div'}
EXPR_RE = re.compile(r'\{\{(.*?)\}\}')
_uri_cache = {}


def data_uri(path):
    if path not in _uri_cache:
        ext = 'png' if path.endswith('.png') else 'webp'
        with open(path, 'rb') as handle:
            _uri_cache[path] = 'data:image/%s;base64,%s' % (
                ext, base64.b64encode(handle.read()).decode('ascii'))
    return _uri_cache[path]


def asset_uri(src):
    rel = src.lstrip('/')
    path = os.path.join(MP, rel)
    if not os.path.isfile(path):
        raise SystemExit('Missing miniprogram asset: ' + src)
    return data_uri(path)


def css_from_wxss():
    text = io.open(WXSS, encoding='utf-8').read()
    return re.sub(r'(-?\d+(?:\.\d+)?)rpx',
                  lambda m: '%gpx' % (float(m.group(1)) * RPX_TO_PX), text)


class Node(object):
    def __init__(self, tag=None, attrs=None, data=None):
        self.tag = tag
        self.attrs = attrs or {}
        self.data = data
        self.children = []


class WxmlParser(HTMLParser):
    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=False)
        self.root = Node()
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag=tag, attrs=dict(attrs))
        self.stack[-1].children.append(node)
        self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag=tag, attrs=dict(attrs)))

    def handle_endtag(self, tag):
        if len(self.stack) > 1:
            self.stack.pop()

    def handle_data(self, data):
        self.stack[-1].children.append(Node(data=data))


def eval_cond(expr, ctx):
    text = expr.strip().strip('{}').strip()
    neg = text.startswith('!')
    if neg:
        text = text[1:]
    if text.endswith('.length'):
        value = len(ctx.get(text[:-7], []) or [])
    else:
        value = ctx.get(text, False)
    return (not value) if neg else bool(value)


def interp(text, ctx, item=None):
    def replace(match):
        expr = match.group(1).strip()
        ternary = re.match(r"(\w+)\s*\?\s*'([^']*)'\s*:\s*'([^']*)'", expr)
        if ternary:
            key, yes, no = ternary.groups()
            return yes if ctx.get(key, False) else no
        if expr.startswith('item.'):
            return str((item or {}).get(expr[5:], ''))
        return str(ctx.get(expr, ''))
    return EXPR_RE.sub(replace, text)


FOLD_KEYS = ('localNoteOpen', 'rulesOpen')


def render_attrs(node, ctx, item, sheet_name, fold_key):
    out = []
    for key, raw in node.attrs.items():
        if key in SKIP_ATTRS:
            continue
        value = interp(raw if raw is not None else '', ctx, item)
        if key == 'src':
            out.append('src="%s" alt=""' % asset_uri(raw))
        elif key in ('bindtap', 'catchtap'):
            fn = value.strip()
            if fn == 'noop':
                out.append('onclick="event.stopPropagation()"')
            else:
                out.append('onclick="%s()"' % fn)
        elif key == 'style':
            out.append('style="%s"' % re.sub(
                r'(-?\d+(?:\.\d+)?)rpx',
                lambda m: '%gpx' % (float(m.group(1)) * RPX_TO_PX), value))
        elif key == 'wx:for':
            continue
        elif key in ('class', 'id'):
            out.append('%s="%s"' % (key, value))
        else:
            continue
    if sheet_name:
        out.append('data-sheet="%s" hidden' % sheet_name)
    elif fold_key:
        out.append('data-fold="%s" hidden' % fold_key)
    return ' '.join(out)


SHEET_KEYS = {
    'walletVisible': 'walletVisible', 'resetVisible': 'resetVisible',
    'birdsVisible': 'birdsVisible', 'wardrobeVisible': 'wardrobeVisible',
}


def render_children(node, ctx, item=None):
    parts = []
    last_if = None
    for child in node.children:
        if child.tag is None:
            parts.append(interp(child.data, ctx, item))
            continue
        attrs = child.attrs
        if 'wx:if' in attrs:
            key = re.sub(r'[{}]', '', attrs['wx:if']).strip()
            # 浮层与折叠体必须常驻 DOM，浏览器里才能真实点击验证交互。
            if key in SHEET_KEYS or key in FOLD_KEYS:
                last_if = None
                parts.append(render_node(child, ctx, item))
                continue
            cond = eval_cond(attrs['wx:if'], ctx)
            last_if = cond
            if not cond:
                continue
        elif 'wx:else' in attrs:
            if last_if:
                last_if = None
                continue
            last_if = None
        else:
            last_if = None
        parts.append(render_node(child, ctx, item))
    return ''.join(parts)


def render_node(node, ctx, item=None):
    if node.tag is None:
        return interp(node.data, ctx, item)
    if 'wx:for' in node.attrs:
        var = re.sub(r'[{}]', '', node.attrs['wx:for']).strip()
        clone = Node(tag=node.tag, attrs=dict(node.attrs))
        clone.attrs.pop('wx:for', None)
        clone.attrs.pop('wx:key', None)
        clone.children = node.children
        return ''.join(render_node(clone, ctx, row) for row in ctx.get(var, []))

    tag = TAG_MAP.get(node.tag, node.tag)
    condition = node.attrs.get('wx:if', '')
    key = re.sub(r'[{}]', '', condition).strip()
    sheet_name = SHEET_KEYS.get(key)
    fold_key = key if key in FOLD_KEYS else None
    attrs = render_attrs(node, ctx, item, sheet_name, fold_key)
    if tag == 'img':
        return '<img %s>' % attrs
    inner = render_children(node, ctx, item)
    return '<%s %s>%s</%s>' % (tag, attrs, inner, tag)


def nav_html():
    nav = lambda name: data_uri(os.path.join(MP, 'assets/navigation/plush', name))
    bg = nav('nav-background.webp')
    icons = [
        ('nav-home-default.webp', '小窝', ''),
        ('nav-city-default.webp', '城市', ''),
        ('nav-shop-default.webp', '商城', ''),
        ('nav-profile-active.webp', '我的', 'is-active'),
    ]
    tabs = ''.join(
        '<div class="preview-tab %s"><img src="%s" alt=""><span>%s</span></div>' % (cls, nav(name), label)
        for name, label, cls in icons)
    return '<div class="preview-tabbar"><img class="preview-tabbar-bg" src="%s" alt="">%s</div>' % (bg, tabs)


EXTRA_CSS = """
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #e8ebe0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
[hidden] { display: none !important; }
img { border: 0; }
.phone { position: relative; width: 390px; height: 844px; margin: 18px auto 24px; overflow: hidden;
    background-color: #c8df83; box-shadow: 0 12px 40px rgba(45,60,35,.18); }
/* 网页端背景挂在固定的 .phone 上，不随内容滚动；预览用同一方式模拟。 */
.phone { background-image: url('@@BG@@'); background-repeat: no-repeat; background-position: center top; background-size: 100% auto; }
.profile-page { position: static; height: 100%; min-height: 0; overflow-x: hidden; overflow-y: auto; background: transparent; }
.bg { display: none; }
.status-space { height: 0; }
/* 小程序里 fixed 覆盖视口；预览中改成相对 .phone 定位，便于 390×844 截图。
   仍需保持 flex 居中 + 遮罩底色，否则弹层会被顶到顶部拉伸，无法与 H5 居中 dialog 比对。 */
.overlay { position: absolute; z-index: 40; display: flex; align-items: center; justify-content: center; background: rgba(66, 83, 62, 0.5); }
.avatar, .item-icon, .bird-avatar, .wardrobe-bird { object-fit: contain; }
.sprite { object-fit: fill; }
.preview-tabbar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 30; height: 77.6px; display: flex; align-items: stretch; padding: 0 14px 7px; }
.preview-tabbar-bg { position: absolute; top: 0; left: 4px; width: calc(100% - 8px); height: 77.6px; z-index: 0; pointer-events: none; }
.preview-tab { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font-size: 13px; font-weight: 600; color: #80502c; text-shadow: 0 1px 1px #fff3d9; }
.preview-tab.is-active { color: #4e8c4c; }
.preview-tab img { width: 33px; height: 33px; object-fit: contain; }
.preview-note { max-width: 390px; margin: 0 auto; padding: 12px 10px 0; color: #5d6b4d; font-size: 12px; line-height: 1.7; }
.device .status-space { height: 88px !important; }
.debug-action { background: #f0ead6; color: #8a7858; }
"""

PREVIEW_JS = """
var SHEETS = ['walletVisible','resetVisible','birdsVisible','wardrobeVisible'];
function sheet(key){ return document.querySelector('[data-sheet="'+key+'"]'); }
function closeSheets(){ SHEETS.forEach(function(k){ sheet(k).hidden = true; }); }
function openSheet(key){ closeSheets(); sheet(key).hidden = false; }
function onWallet(){ openSheet('walletVisible'); }
function onReset(){ openSheet('resetVisible'); }
function onBirds(){ openSheet('birdsVisible'); }
function onWardrobe(){ openSheet('wardrobeVisible'); }
function toggleRules(){ var b=document.querySelector('.rules-fold .fold-body'); if(b) b.hidden=!b.hidden;
  var t=document.querySelector('.rules-fold .fold-title'); t.textContent=(b&&!b.hidden?'▾':'▸')+' 查看叽分获取与使用规则'; }
function toggleLocalNote(){ var b=document.querySelector('.fold:not(.rules-fold) .fold-body'); if(b) b.hidden=!b.hidden;
  var t=document.querySelector('.fold:not(.rules-fold) .fold-title'); t.textContent=(b&&!b.hidden?'▾':'▸')+' 本机保存 · 查看说明'; }
function confirmReset(){ closeSheets(); document.querySelector('.reset-confirm').textContent='已清除'; window.__previewReset=true; }
function goHome(){ closeSheets(); window.__previewGoHome=true; }
function goAdopt(){ closeSheets(); window.__previewGoAdopt=true; }
document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('.fold-body').forEach(function(n){ n.hidden=true; });
  var q=new URLSearchParams(location.search);
  if(q.get('sheet')) openSheet(q.get('sheet'));
  if(q.get('device')==='1') document.querySelector('.phone').classList.add('device');
});
"""


def build(state, name, title):
    parser = WxmlParser()
    parser.feed(io.open(WXML, encoding='utf-8').read())
    body = render_children(parser.root, state)
    css = css_from_wxss() + EXTRA_CSS.replace('@@BG@@', asset_uri('/assets/profile/felt/background.webp'))
    html = u"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=390,initial-scale=1">
<title>%s</title><style>%s</style></head><body>
<div class="preview-note">%s</div>
<div class="phone"><div class="profile-page">%s</div>%s</div>
<script>%s</script></body></html>
""" % (title, css, title, body, nav_html(), PREVIEW_JS)
    with io.open(os.path.join(OUT_DIR, name), 'w', encoding='utf-8') as handle:
        handle.write(html)
    return os.path.getsize(os.path.join(OUT_DIR, name))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    sizes = {}
    sizes['index.html'] = build(FILLED, 'index.html', '小程序「我的」页 · 有小鸟态（390px 产品态，与 H5 基线对比）')
    sizes['empty.html'] = build(EMPTY, 'empty.html', '小程序「我的」页 · 空态（390px 产品态，与 H5 基线对比）')
    with io.open(os.path.join(OUT_DIR, 'preview-data.json'), 'w', encoding='utf-8') as handle:
        handle.write(json.dumps({'filled': FILLED, 'empty': EMPTY, 'rpxToPx': RPX_TO_PX,
                                 'sizes': sizes}, ensure_ascii=False, indent=2))
    for name, size in sizes.items():
        print('%s  %.1f KB' % (name, size / 1024.0))
    print('output: ' + OUT_DIR)


if __name__ == '__main__':
    main()
