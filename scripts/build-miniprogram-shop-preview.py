#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""小程序商城页 → 自包含浏览器预览（仅版式/交互校对，不进小程序包）。

- 视口 390px，rpx→px 系数 0.52（750rpx = 390px），与网页端 390px 基线同宽。
- WXSS 自动读取并换算；素材内联 data URI，任意静态服务打开都不破图。
- ?panel=detail|cart|added|rules 截图用；?test=1 跑交互断言（配合 --dump-dom）。
"""
import base64
import io
import json
import os
import re
import sys

ROOT = '/Users/beluga/Code/xcwc/xcwc-web'
MP = os.path.join(ROOT, 'miniprogram')
SHOP_ASSETS = os.path.join(MP, 'assets/shop')
NAV_ASSETS = os.path.join(MP, 'assets/navigation/plush')
OUT_DIR = os.path.join(ROOT, 'output', 'miniprogram-shop-preview')
CATALOG = '/Users/beluga/Code/xcwc/xcwc-api/src/main/resources/shop/catalog.json'
# 可选参数：模拟机型宽度（默认 390）。750rpx 恒等于整屏宽，故 1rpx = WIDTH / 750 px。
WIDTH = int(sys.argv[1]) if len(sys.argv) > 1 else 390
SCALE = WIDTH / 750.0
OUT = os.path.join(OUT_DIR, 'index.html' if WIDTH == 390 else 'index-%d.html' % WIDTH)


def data_uri(path):
    ext = 'png' if path.endswith('.png') else 'webp'
    with open(path, 'rb') as f:
        return 'data:image/%s;base64,%s' % (ext, base64.b64encode(f.read()).decode('ascii'))


def css_from_wxss():
    text = io.open(os.path.join(MP, 'pages/shop/shop.wxss'), encoding='utf-8').read()
    return re.sub(r'(-?\d+(?:\.\d+)?)rpx', lambda m: '%gpx' % (float(m.group(1)) * SCALE), text)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    catalog = json.load(open(CATALOG, encoding='utf-8'))
    products = []
    for p in catalog['products']:
        if p.get('enabled', True) is False:
            continue
        products.append({
            'id': p['id'], 'title': p['title'], 'city': p['cityName'],
            'cityCode': p['cityCode'], 'remark': p.get('remark', ''),
            'price': p['price'], 'priceText': '¥%g' % p['price'],
            'cover': data_uri(os.path.join(SHOP_ASSETS, 'covers', p['id'] + '.webp')),
            'sortOrder': p['sortOrder'],
            'description': p['cityName'] + '城市系列 · ' + p.get('remark', '') + '。当前小程序仅供浏览，暂未开通购买。',
        })

    felt = lambda n: data_uri(os.path.join(SHOP_ASSETS, 'felt', n))
    icon = lambda n: data_uri(os.path.join(SHOP_ASSETS, 'icons', n))
    pink, green, cream, card = felt('pink-pill.webp'), felt('green-button.webp'), felt('cream-panel.webp'), felt('card.webp')
    bird, cart, cart_white, happy = (icon('bird.png'), icon('cart.png'),
                                     icon('cart-white.png'), icon('happy.webp'))
    banner = data_uri(os.path.join(SHOP_ASSETS, 'banners', 'banner-1.webp'))
    nav = lambda n: data_uri(os.path.join(NAV_ASSETS, n))
    nav_bg, nav_home, nav_city, nav_shop, nav_profile = (
        nav('nav-background.webp'), nav('nav-home-default.webp'), nav('nav-city-default.webp'),
        nav('nav-shop-active.webp'), nav('nav-profile-default.webp'))

    css = css_from_wxss()
    extra = u"""
body { margin: 0; background: #e8ebe0; font-family: -apple-system, "PingFang SC", sans-serif; }
.preview-note { max-width: @@WIDTH@@px; margin: 0 auto; padding: 10px 14px 6px; color: #5d6b4d; font-size: 11px; line-height: 1.6; }
.phone { position: relative; width: @@WIDTH@@px; margin: 0 auto 24px; overflow: hidden; background: #edf0d7; box-shadow: 0 10px 40px rgba(45,60,35,.18); }
.shop-page { min-height: auto; }
.status-space { height: 44px; }
img { border: 0; }
.hidden { display: none !important; }
.panel-content { overflow-y: auto; }
select.city-select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.preview-tabbar { position: sticky; bottom: 0; z-index: 20; height: 74px; margin-top: -74px; display: flex; align-items: center; justify-content: space-around; }
.preview-tabbar-bg { position: absolute; inset: 0; width: 100%; height: 100%; }
.preview-tab { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 11px; color: #8a7a5d; }
.preview-tab.is-active { color: #5f7a4f; font-weight: 600; }
.preview-tab img { width: 30px; height: 30px; }
/* 小程序用 image 组件铺底；静态预览改成一次性 CSS 背景。 */
.masthead-bg, .benefit-bg, .filter-bg, .panel-head-bg, .button-bg { background-image: url('@@PINK@@'); background-size: 100% 100%; }
.filter-bg.is-green, .button-bg { background-image: url('@@GREEN@@'); }
.intro-texture, .stamp-bg { background-image: url('@@CREAM@@'); background-size: 100% 100%; }
.card-bg { background-image: url('@@CARD@@'); background-size: 100% 100%; }
#test-out { position: fixed; left: 8px; top: 8px; z-index: 9999; max-width: 370px; padding: 8px; background: #fff; color: #222; font: 11px/1.5 monospace; white-space: pre-wrap; }
"""
    for key, value in (('@@PINK@@', pink), ('@@GREEN@@', green), ('@@CREAM@@', cream),
                       ('@@CARD@@', card), ('@@WIDTH@@', str(WIDTH))):
        extra = extra.replace(key, value)

    tpl = u"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>小程序商城页 · 网页端对照预览 390px</title>
<style>@@CSS@@
@@EXTRA@@
</style></head><body>
<div class="preview-note">静态对照预览：WXML/WXSS 自动换算（750rpx → @@WIDTH@@px），商品/素材为真实数据。底部毛绒导航为全站自定义 tabBar 示意，非本页代码。</div>
<pre id="test-out" class="hidden"></pre>
<div class="phone">
<div class="shop-page">
    <div class="status-space"></div>
    <div class="app">
        <div class="masthead">
            <div class="masthead-bg"></div>
            <div class="brand">
                <div class="brand-mark"><img class="brand-icon" src="@@BIRD@@"></div>
                <div class="brand-text"><span class="brand-name">小鸟商城</span><span class="brand-en">BIRD CITY DIARY</span></div>
            </div>
            <div class="cart-icon" id="cartBtn"><img class="cart-img" src="@@CART@@"><span id="cartCount" class="cart-count hidden">0</span></div>
        </div>
        <div class="hero">
            <div class="hero-swiper"><img class="hero-image" src="@@BANNER@@"></div>
        </div>
        <div class="intro">
            <div class="intro-texture"></div>
            <div class="intro-copy">
                <span class="eyebrow">A LITTLE BIRD, A NEW JOURNEY</span>
                <span class="intro-title">把一座城市，带回家。</span>
                <span class="intro-desc">遇见城市限定小鸟，收藏属于你的旅行记忆</span>
            </div>
            <div class="intro-stamp"><div class="stamp-bg"></div><span class="stamp-line">城市限定</span><span class="stamp-line">温暖相伴</span><div class="stamp-leaf"></div></div>
        </div>
        <div class="benefit">
            <div class="benefit-bg"></div>
            <span class="egg-art">🥚</span><span class="benefit-copy">绑定实体小鸟，解锁对应城市鸟蛋</span>
            <div class="benefit-action" id="rulesBtn"><span class="benefit-action-text">了解规则</span><span class="benefit-action-arrow">›</span></div>
        </div>
        <div class="toolbar">
            <div class="category"><div class="category-title"><img class="category-icon" src="@@HAPPY@@"><span>全部小鸟</span></div><span class="result-count" id="resultCount">共 17 只城市小鸟</span></div>
            <div class="filters">
                <div class="filter" id="sortDefault"><div class="filter-bg"></div><span class="filter-label">综合排序</span></div>
                <div class="filter" id="sortPrice"><div class="filter-bg" id="priceBg"></div><span class="filter-label" id="sortLabel">价格 ↕</span></div>
                <div class="filter city-filter"><div class="filter-bg"></div><span class="filter-label" id="cityLabel">全部城市</span><span class="filter-arrow">▾</span>
                    <select class="city-select" id="citySelect"><option value="">全部城市</option><option value="hangzhou">杭州</option><option value="suzhou">苏州</option><option value="luoyang">洛阳</option><option value="taizhou">台州</option><option value="shaoxing">绍兴</option></select>
                </div>
            </div>
        </div>
        <div id="emptyBlock" class="hidden"><div class="shop-status">该城市暂无商品，去看看其他城市的小鸟吧。</div><div class="shop-retry" id="clearCity"><span class="retry-text">查看全部城市</span></div></div>
        <div class="products" id="products"></div>
        <div class="end">一鸟一城 · 旅途未完待续</div>
    </div>

    <div id="overlay" class="overlay hidden">
        <div class="panel" id="panel">
            <div class="panel-head"><div class="panel-head-bg"></div><span class="panel-title" id="panelTitle"></span><div class="panel-close" id="panelClose"><span class="close-mark">×</span></div></div>
            <div class="panel-content" id="panelContent"></div>
        </div>
    </div>
    <div id="toast" class="toast hidden"><span id="toastText"></span></div>
</div>
<div class="preview-tabbar">
    <img class="preview-tabbar-bg" src="@@NAV_BG@@">
    <div class="preview-tab"><img src="@@NAV_HOME@@"><span>小窝</span></div>
    <div class="preview-tab"><img src="@@NAV_CITY@@"><span>城市</span></div>
    <div class="preview-tab is-active"><img src="@@NAV_SHOP@@"><span>商城</span></div>
    <div class="preview-tab"><img src="@@NAV_PROFILE@@"><span>我的</span></div>
</div>
</div>
<script>
const PRODUCTS = @@PRODUCTS@@;
const CART_WHITE = '@@CART_WHITE@@';
let sort = 'default', city = '', cart = [], panelKind = '', detail = null, detailTextOpen = false, addedAlready = false;
let toastTimer = null;
const $ = id => document.getElementById(id);

function cardHtml(p, i) {
    const added = cart.indexOf(p.id) >= 0;
    return '<div class="card' + (i % 2 === 0 ? ' card-left' : '') + '" data-id="' + p.id + '">' +
        '<div class="card-bg"></div>' +
        '<img class="photo" src="' + p.cover + '">' +
        '<div class="card-body"><span class="product-name">' + p.title + '</span>' +
        '<span class="product-remark">' + p.remark + '</span>' +
        '<div class="card-bottom"><span class="price">' + p.priceText + '</span>' +
        '<div class="add" data-id="' + p.id + '"><div class="add-circle' + (added ? ' is-added' : '') + '"></div>' +
        (added ? '<span class="add-check">✓</span>' : '<img class="add-icon" src="' + CART_WHITE + '">') +
        '</div></div></div></div>';
}
function render() {
    let list = PRODUCTS.filter(p => !city || p.cityCode === city);
    if (sort === 'priceAsc') list.sort((a,b) => a.price - b.price || a.sortOrder - b.sortOrder);
    else if (sort === 'priceDesc') list.sort((a,b) => b.price - a.price || a.sortOrder - b.sortOrder);
    else list.sort((a,b) => a.sortOrder - b.sortOrder);
    $('products').innerHTML = list.map(cardHtml).join('');
    $('resultCount').textContent = '共 ' + list.length + ' 只城市小鸟';
    $('emptyBlock').classList.toggle('hidden', list.length > 0);
    document.querySelectorAll('.card').forEach(el => el.addEventListener('click', () => openDetail(el.dataset.id)));
    document.querySelectorAll('.add').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); addToCart(el.dataset.id); }));
    $('sortLabel').textContent = sort === 'priceAsc' ? '价格 ↑' : sort === 'priceDesc' ? '价格 ↓' : '价格 ↕';
    $('sortPrice').classList.toggle('is-active', sort !== 'default');
    $('priceBg').classList.toggle('is-green', sort !== 'default');
    updateCartBadge();
}
function findProduct(id) { return PRODUCTS.find(x => x.id === id) || null; }
function updateCartBadge() {
    $('cartCount').textContent = String(cart.length);
    $('cartCount').classList.toggle('hidden', cart.length === 0);
}
function openDetail(id) {
    const p = findProduct(id); if (!p) return;
    detail = p; detailTextOpen = false;
    showPanel('detail', p.title);
}
function showPanel(kind, title) {
    panelKind = kind;
    $('panelTitle').textContent = title;
    $('panelContent').className = 'panel-content' + ((kind === 'rules' || kind === 'added') ? ' is-short' : '');
    $('overlay').classList.remove('hidden');
    renderPanel();
}
function renderPanel() {
    if (panelKind === 'detail') {
        $('panelContent').innerHTML =
            '<img class="detail-cover" src="' + detail.cover + '">' +
            '<div class="detail-body"><span class="detail-title">' + detail.title + '</span>' +
            '<span class="detail-remark">' + detail.city + ' · ' + detail.remark + '</span>' +
            '<span class="detail-price">' + detail.priceText + '</span>' +
            '<div class="detail-divider"></div><span class="detail-desc">' + detail.description + '</span>' +
            '<span class="detail-note">商品价格与库存以实际售卖页面为准。当前小程序不提供站内下单、支付与订单，也不因浏览或加购发放鸟蛋。</span>' +
            '<div class="detail-text-head" id="textToggle"><span>商品文字信息</span><span class="detail-text-arrow">' + (detailTextOpen ? '−' : '+') + '</span></div>' +
            (detailTextOpen ? '<div class="detail-text-block"><span class="detail-text-line">参考价格：' + detail.priceText + '</span><span class="detail-text-line">所属城市：' + detail.city + '</span><span class="detail-text-line">' + detail.remark + '</span></div>' : '') +
            '<div class="detail-add-btn" id="detailAdd"><div class="button-bg"></div><span class="detail-add-label">' + (cart.indexOf(detail.id) >= 0 ? '已在购物车中' : '加入购物车') + '</span></div></div>';
        $('textToggle').addEventListener('click', () => { detailTextOpen = !detailTextOpen; renderPanel(); });
        $('detailAdd').addEventListener('click', () => addToCart(detail.id));
    } else if (panelKind === 'cart') {
        const items = cart.map(findProduct).filter(Boolean);
        $('panelContent').innerHTML = '<div class="detail-body"><span class="cart-panel-status">我的购物车 · ' + items.length + ' 只小鸟</span>' +
            (items.length === 0 ? '<div class="cart-empty">还没有小鸟来做客，把喜欢的小鸟加入购物车吧。</div>' : '') +
            items.map(p => '<div class="cart-row"><img class="cart-cover" src="' + p.cover + '"><div class="cart-copy">' +
                '<span class="cart-name">' + p.title + '</span><span class="cart-price">' + p.priceText + '</span>' +
                '<div class="cart-actions"><span class="cart-buy">购买暂未开通</span>' +
                '<span class="cart-remove" data-id="' + p.id + '">移除</span></div></div></div>').join('') +
            '<span class="cart-note">购物车只保存在本机，不代表已下单；当前小程序不跳淘宝、不支付、不产生订单，清除缓存会清空记录。</span>' +
            (items.length === 0 ? '<div class="primary-btn" id="keepShopping"><div class="button-bg"></div><span class="primary-label">继续逛逛</span></div>' : '') + '</div>';
        document.querySelectorAll('.cart-buy').forEach(el => el.addEventListener('click', () => toast('当前小程序不提供购买，购物车仅本机暂存')));
        document.querySelectorAll('.cart-remove').forEach(el => el.addEventListener('click', e => {
            e.stopPropagation(); cart = cart.filter(id => id !== el.dataset.id); render(); renderPanel();
        }));
        if (items.length === 0) $('keepShopping').addEventListener('click', closePanel);
    } else if (panelKind === 'added') {
        $('panelContent').innerHTML = '<div class="detail-body"><img class="added-cover" src="' + detail.cover + '">' +
            '<span class="added-title">' + detail.title + '</span>' +
            '<span class="added-note">' + (addedAlready ? '这只小鸟已在购物车中' : '已加入购物车') + '，可前往购物车查看。</span>' +
            '<div class="primary-btn" id="goCart"><div class="button-bg"></div><span class="primary-label">去购物车看看</span></div>' +
            '<div class="ghost-btn" id="keepBrowse"><span>继续逛逛</span></div></div>';
        $('goCart').addEventListener('click', () => showPanel('cart', '我的购物车'));
        $('keepBrowse').addEventListener('click', closePanel);
    } else {
        $('panelContent').innerHTML = '<div class="rules"><span class="rules-title">一颗鸟蛋，一段城市旅程</span>' +
            '<span class="rules-line">碰一碰实体小鸟或扫描已建档链接，即可在本机领取属于你的城市小鸟。</span>' +
            '<span class="rules-line">挑选喜欢的城市小鸟加入本机购物车；购物车不代表已下单，当前不提供淘宝跳转、站内支付与订单管理。</span>' +
            '<span class="rules-line">浏览或加购商品不会领取小鸟、发放鸟蛋或叽分；调试期数据只保存在本机，不跨设备同步。</span></div>';
    }
}
function addToCart(id) {
    const p = findProduct(id); if (!p) return;
    const already = cart.indexOf(id) >= 0;
    if (!already) cart.push(id);
    detail = p; addedAlready = already;
    updateCartBadge(); render();
    showPanel('added', already ? '这只小鸟已在购物车中' : '已加入购物车');
}
function openCart() { showPanel('cart', '我的购物车'); }
function openRules() { showPanel('rules', '一颗鸟蛋，一段城市旅程'); }
function closePanel() { $('overlay').classList.add('hidden'); panelKind = ''; }
function toast(text) {
    clearTimeout(toastTimer); $('toastText').textContent = text; $('toast').classList.remove('hidden');
    toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 2800);
}
$('cartBtn').addEventListener('click', openCart);
$('rulesBtn').addEventListener('click', openRules);
$('panelClose').addEventListener('click', closePanel);
$('overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closePanel(); });
$('sortDefault').addEventListener('click', () => { sort = 'default'; render(); });
$('sortPrice').addEventListener('click', () => { sort = sort === 'priceAsc' ? 'priceDesc' : 'priceAsc'; render(); });
$('citySelect').addEventListener('change', e => {
    city = e.target.value; $('cityLabel').textContent = e.target.options[e.target.selectedIndex].text; render();
});
$('clearCity').addEventListener('click', () => {
    city = ''; $('citySelect').value = ''; $('cityLabel').textContent = '全部城市'; render();
});
render();

const params = new URLSearchParams(location.search);
const preset = parseInt(params.get('cart'), 10);
if (preset > 0) { cart = PRODUCTS.slice(0, Math.min(preset, 17)).map(p => p.id); render(); }
const panel = params.get('panel');
if (panel === 'detail') openDetail(PRODUCTS[0].id);
if (panel === 'cart') openCart();
if (panel === 'rules') openRules();
if (panel === 'added') { addToCart(PRODUCTS[0].id); }
if (params.get('text') === '1') { openDetail(PRODUCTS[0].id); detailTextOpen = true; renderPanel(); }

// ?test=1：同步交互断言，结果写进 #test-out 供 --dump-dom 抓取。
if (params.get('test') === '1') {
    const out = [];
    const ok = (label, cond, extra) => out.push((cond ? 'PASS ' : 'FAIL ') + label + (extra ? ' | ' + extra : ''));
    const click = el => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    cart = []; render();
    ok('初始 17 款商品', document.querySelectorAll('.card').length === 17, 'cards=' + document.querySelectorAll('.card').length);
    ok('结果数文案', $('resultCount').textContent === '共 17 只城市小鸟', $('resultCount').textContent);
    click($('sortPrice'));
    ok('价格排序标签', $('sortLabel').textContent === '价格 ↑', $('sortLabel').textContent);
    ok('价格筛选高亮', $('sortPrice').classList.contains('is-active'));
    click($('sortPrice'));
    ok('价格降序', $('sortLabel').textContent === '价格 ↓', $('sortLabel').textContent);
    click($('sortDefault'));
    ok('综合排序复位', $('sortLabel').textContent === '价格 ↕', $('sortLabel').textContent);
    $('citySelect').value = 'suzhou'; $('citySelect').dispatchEvent(new Event('change'));
    ok('苏州筛选 3 款', document.querySelectorAll('.card').length === 3, 'cards=' + document.querySelectorAll('.card').length);
    ok('筛选标签', $('cityLabel').textContent === '苏州', $('cityLabel').textContent);
    $('citySelect').value = ''; $('citySelect').dispatchEvent(new Event('change'));
    ok('恢复全部', document.querySelectorAll('.card').length === 17);
    click(document.querySelector('.add'));
    ok('加购后角标 1', $('cartCount').textContent === '1' && !$('cartCount').classList.contains('hidden'));
    ok('加购结果面板', panelKind === 'added', 'panel=' + panelKind);
    click($('goCart'));
    ok('购物车 1 行', document.querySelectorAll('.cart-row').length === 1, 'rows=' + document.querySelectorAll('.cart-row').length);
    click(document.querySelector('.cart-buy'));
    ok('购买拦截 toast', !$('toast').classList.contains('hidden') && $('toastText').textContent.indexOf('不提供购买') >= 0);
    click(document.querySelector('.cart-remove'));
    ok('移除后空态', document.querySelectorAll('.cart-row').length === 0 && !!document.querySelector('.cart-empty'));
    ok('角标清零', $('cartCount').classList.contains('hidden'));
    click($('keepShopping'));
    ok('继续逛逛关闭面板', $('overlay').classList.contains('hidden'));
    click(document.querySelector('.card'));
    ok('详情面板', panelKind === 'detail');
    ok('详情未展开文字', !document.querySelector('.detail-text-block'));
    click($('textToggle'));
    ok('文字信息展开', !!document.querySelector('.detail-text-block'));
    click($('detailAdd'));
    ok('详情加购', panelKind === 'added' && $('cartCount').textContent === '1');
    click($('keepBrowse'));
    click($('rulesBtn'));
    ok('规则面板', panelKind === 'rules' && !!document.querySelector('.rules'));
    click($('panelClose'));
    ok('关闭按钮', $('overlay').classList.contains('hidden'));
    const failed = out.filter(x => x.indexOf('FAIL') === 0).length;
    out.push('TOTAL ' + out.length + ' / FAILED ' + failed);
    $('test-out').textContent = out.join('\\n');
    $('test-out').classList.remove('hidden');
}

// ?measure=1：输出关键区块几何与字号，用于与网页端基线逐项比对。
if (params.get('measure') === '1') {
    const selectors = ['.app', '.masthead', '.hero', '.intro', '.benefit', '.toolbar', '.category',
        '.filters', '.filter', '.products', '.card', '.photo', '.card-body', '.product-name',
        '.product-remark', '.price', '.add', '.end'];
    const rects = {};
    selectors.forEach(s => {
        const el = document.querySelector(s);
        if (!el) return;
        const r = el.getBoundingClientRect();
        rects[s] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    });
    const fonts = {};
    ['.brand-name', '.intro-title', '.intro-desc', '.eyebrow', '.benefit-copy', '.category-title',
     '.result-count', '.filter-label', '.product-name', '.product-remark', '.price', '.end'].forEach(s => {
        const el = document.querySelector(s);
        if (el) fonts[s] = getComputedStyle(el).fontSize;
    });
    // 溢出检测：文字节点是否被截断、卡片是否超出整屏宽。
    const overflow = [];
    ['.intro-title', '.eyebrow', '.intro-desc', '.benefit-copy', '.benefit-action-text',
     '.category-title', '.result-count', '.filter-label', '.product-name', '.product-remark',
     '.price', '.end'].forEach(s => {
        document.querySelectorAll(s).forEach((el, i) => {
            if (el.scrollWidth > el.clientWidth + 1) {
                overflow.push(s + '#' + i + ' scroll=' + el.scrollWidth + ' client=' + el.clientWidth);
            }
        });
    });
    const card = document.querySelector('.card');
    const page = document.querySelector('.shop-page');
    const cardsRight = card ? Math.round(card.getBoundingClientRect().right) : 0;
    const pageRight = page ? Math.round(page.getBoundingClientRect().right) : 0;
    $('test-out').textContent = '@@MEASURE@@' + JSON.stringify({
        rects: rects, fonts: fonts, width: window.innerWidth,
        overflow: overflow, cardsRight: cardsRight, pageRight: pageRight
    }) + '@@END@@';
    $('test-out').classList.remove('hidden');
}
</script>
</body></html>
"""
    html = tpl
    for key, value in (
        ('@@CSS@@', css), ('@@EXTRA@@', extra), ('@@BIRD@@', bird), ('@@HAPPY@@', happy), ('@@CART@@', cart),
        ('@@CART_WHITE@@', cart_white), ('@@BANNER@@', banner), ('@@NAV_BG@@', nav_bg),
        ('@@NAV_HOME@@', nav_home), ('@@NAV_CITY@@', nav_city), ('@@NAV_SHOP@@', nav_shop),
        ('@@NAV_PROFILE@@', nav_profile), ('@@PRODUCTS@@', json.dumps(products, ensure_ascii=False)),
        ('@@WIDTH@@', str(WIDTH)),
    ):
        html = html.replace(key, value)
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('written', OUT, '%.1f KB' % (len(html.encode('utf-8')) / 1024))


if __name__ == '__main__':
    main()
