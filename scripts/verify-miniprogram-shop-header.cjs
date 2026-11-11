'use strict';
// 商城页全屏底图 + 品牌条等比避让胶囊：静态结构与几何矩阵门禁。
// 不依赖微信开发者工具；几何直接跑真机同一份 utils/shop-layout.js。
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const ROOT = '/Users/beluga/Code/xcwc/xcwc-web';
const MP = path.join(ROOT, 'miniprogram');
const SHOP = path.join(MP, 'pages/shop');
const layout = require(path.join(MP, 'utils/shop-layout.js'));
const problems = [];
const facts = [];
const read = p => fs.readFileSync(p, 'utf8');
const check = (label, cond, extra) => {
    if (!cond) problems.push(label + (extra ? ': ' + extra : ''));
    else facts.push(label + (extra ? ' (' + extra + ')' : ''));
};

// ---- 1. 语法 / 结构 -----------------------------------------------------
for (const name of ['shop.js']) {
    const r = cp.spawnSync(process.execPath, ['--check', path.join(SHOP, name)], { encoding: 'utf8' });
    check('JS 语法 ' + name, r.status === 0, r.stderr.trim());
}
{
    const r = cp.spawnSync(process.execPath, ['--check', path.join(MP, 'utils/shop-layout.js')], { encoding: 'utf8' });
    check('JS 语法 shop-layout.js', r.status === 0, r.stderr.trim());
}
const wxml = read(path.join(SHOP, 'shop.wxml'));
const tagRe = /<\/?([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
const stack = [];
let m;
while ((m = tagRe.exec(wxml))) {
    const closing = m[0][1] === '/';
    const tag = m[1];
    if (m[3] === '/' || ['image', 'input', 'icon'].indexOf(tag) >= 0) continue;
    if (closing) {
        const last = stack.pop();
        if (last !== tag) problems.push('WXML 标签不配对: </' + tag + '> 对应 ' + last);
    } else stack.push(tag);
}
check('WXML 标签配对', stack.length === 0, stack.join(','));
[/\?\./, /\?\?/, /=>/, /\{\{[^}]*\b\w+\([^}]*\)\}\}/].forEach((re, i) =>
    check('WXML 禁用语法 #' + i, !re.test(wxml)));

const wxssRaw = read(path.join(SHOP, 'shop.wxss'));
const wxss = wxssRaw.replace(/\/\*[\s\S]*?\*\//g, '');
const js = read(path.join(SHOP, 'shop.js'));

// ---- 2. 全屏底图 --------------------------------------------------------
const sceneRe = /<image\s+class="page-scene"[^>]*>/;
const sceneTag = (wxml.match(sceneRe) || [''])[0];
check('存在唯一整页底图', (wxml.match(/class="page-scene"/g) || []).length === 1);
check('底图引用商城专用资源', /src="\/assets\/shop\/felt\/page-background\.webp"/.test(sceneTag));
check('底图整屏拉伸', /mode="scaleToFill"/.test(sceneTag));
check('底图高度绑定视口', /style="height:\{\{viewportHeight\}\}rpx"/.test(sceneTag));
check('底图在页面根节点首层', wxml.indexOf('class="page-scene"') < wxml.indexOf('class="status-space"'));
const sceneRule = (wxss.match(/\.page-scene\s*\{([^}]*)\}/) || ['', ''])[1];
['position:\\s*fixed', 'top:\\s*0', 'left:\\s*0', 'width:\\s*100%', 'z-index:\\s*0', 'pointer-events:\\s*none']
    .forEach(re => check('底图 WXSS ' + re, new RegExp(re).test(sceneRule)));
check('页面容器可定位', /\.shop-page\s*\{[^}]*position:\s*relative/s.test(wxss));
check('状态栏占位透明', /\.status-space\s*\{[^}]*background:\s*transparent/s.test(wxss));
check('内容层透明', /\.app\s*\{[^}]*background:\s*transparent/s.test(wxss));
check('不再有割裂的渐变（WXSS）', !/linear-gradient\(180deg,\s*#dfedce/.test(wxss));
const bgPath = path.join(MP, 'assets/shop/felt/page-background.webp');
check('底图素材存在', fs.existsSync(bgPath));
if (fs.existsSync(bgPath)) {
    const buf = fs.readFileSync(bgPath);
    check('底图为 WebP', buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP');
    check('底图体积 ≤ 100 KB', buf.length <= 100 * 1024, (buf.length / 1024).toFixed(1) + ' KB');
}
check('素材生成脚本可复现底图', /build_page_background/.test(read(path.join(ROOT, 'scripts/build-miniprogram-shop-assets.py'))));

// ---- 3. 品牌条：等比缩放、脱离文档流、避开胶囊 -------------------------
const mastheadTag = (wxml.match(/<view\s+class="masthead"[^>]*>/) || [''])[0];
check('品牌条有内联定位', /top:\{\{mastheadTop\}\}rpx/.test(mastheadTag) && /left:\{\{mastheadLeft\}\}rpx/.test(mastheadTag));
check('品牌条只有一个等比 scale', /transform:scale\(\{\{mastheadScale\}\}\)/.test(mastheadTag));
check('品牌条没有单独改宽度', !/width:\{\{/.test(mastheadTag));
check('品牌条已移出 .app', wxml.indexOf('class="masthead"') < wxml.indexOf('<view class="app">'));
check('状态栏背景和轮播重叠 1px，占位高度仍使用 headerSpace',
    /class="status-space"[^>]*height:\s*calc\(\{\{headerSpace\}\}rpx \+ 1px\)/.test(wxml) &&
    /\.status-space\s*\{[^}]*margin-bottom:\s*-1px/.test(wxss));
check('购物车入口保留', /class="cart-icon"[^>]*bindtap="handleOpenCart"/.test(wxml));
const cartHitRpx = 154;
check('购物车透明热区存在', /class="cart-hit"/.test(wxml) && new RegExp(`\\.cart-hit\\s*\\{[^}]*width:\\s*${cartHitRpx}rpx[^}]*height:\\s*${cartHitRpx}rpx`).test(wxss));
const mastRule = (wxss.match(/\.masthead\s*\{([^}]*)\}/) || ['', ''])[1];
check('品牌条绝对定位', /position:\s*absolute/.test(mastRule));
check('品牌条基准尺寸不变', /width:\s*726rpx/.test(mastRule) && /height:\s*128rpx/.test(mastRule));
check('品牌条缩放原点左上角', /transform-origin:\s*0\s+0/.test(mastRule));
check('品牌条去掉流内 margin', !/margin:/.test(mastRule));
check('品牌条层级高于内容层', /z-index:\s*6/.test(mastRule));
check('shop.js 引入布局模块', /require\('\.\.\/\.\.\/utils\/shop-layout'\)/.test(js));
for (const key of ['headerSpace', 'viewportHeight', 'mastheadLeft', 'mastheadTop', 'mastheadScale']) {
    check('布局字段已声明/注入 ' + key,
        new RegExp('^\\s{8}' + key + ':', 'm').test(js) && new RegExp(key + ': layout\\.' + key).test(js));
}
const unsupported = [
    [/:host\b/, ':host'], [/background-image\s*:\s*url\(['"]?\/assets/, '本地 background-image'],
    [/\bcqw\b/, 'cqw 单位'], [/:has\(/, ':has()'], [/mix-blend-mode/, 'mix-blend-mode'],
    [/::before/, '::before'], [/aspect-ratio\s*:/, 'aspect-ratio'],
];
unsupported.forEach(([re, label]) => check('WXSS 不含 ' + label, !re.test(wxss)));

// ---- 4. 几何矩阵（真机同一份 computeShopLayout） -----------------------
const devices = [
    { name: '320×568', w: 320, h: 568, sb: 20, menu: { left: 246, top: 26, height: 32 } },
    { name: '320×568 宽胶囊', w: 320, h: 568, sb: 20, menu: { left: 226, top: 26, height: 32 } },
    { name: '375×812', w: 375, h: 812, sb: 44, menu: { left: 289, top: 53, height: 27 } },
    { name: '390×844', w: 390, h: 844, sb: 47, menu: { left: 302, top: 70, height: 36 } },
    { name: '402×874', w: 402, h: 874, sb: 47, menu: { left: 310, top: 72, height: 36 } },
    { name: '430×932', w: 430, h: 932, sb: 54, menu: { left: 340, top: 74, height: 36 } },
    { name: '320×568 无胶囊回退', w: 320, h: 568, sb: 20, menu: null },
    { name: '无胶囊回退', w: 375, h: 812, sb: 44, menu: null },
    { name: '异常胶囊回退', w: 375, h: 812, sb: 44, menu: { left: 0, top: -1, height: 0 } },
];
const geometries = [];
for (const d of devices) {
    // 与 utils/safe-area.js readTopInsetRpx 同式
    const bottom = d.menu && d.menu.left > 0
        ? Math.max(d.sb + 44, d.menu.top + d.menu.height)
        : d.sb + 44;
    const safePx = Math.min(Math.max(bottom + 8, 44), 160);
    const topInset = Math.round(safePx * 750 / d.w);
    const r = layout.computeShopLayout({
        windowWidth: d.w, windowHeight: d.h, statusBarHeight: d.sb,
        topInset: topInset, menu: d.menu,
    });
    const right = r.mastheadLeft + layout.MASTHEAD_WIDTH_RPX * r.mastheadScale;
    const bottomOfPill = r.mastheadTop + layout.MASTHEAD_HEIGHT_RPX * r.mastheadScale;
    check(d.name + ' 缩放系数合理', r.mastheadScale >= 0.5 && r.mastheadScale <= 1, String(r.mastheadScale));
    check(d.name + ' 右边界不越过胶囊', right <= r.menuLeftRpx - layout.MENU_GAP_RPX + 1,
        'right=' + right.toFixed(1) + ' menu=' + r.menuLeftRpx);
    check(d.name + ' 不侵入状态栏', r.mastheadTop >= r.statusBarRpx + layout.STATUS_BAR_GAP_RPX - 1,
        'top=' + r.mastheadTop + ' statusBar=' + r.statusBarRpx);
    check(d.name + ' 占位不压住品牌条', r.headerSpace >= bottomOfPill + layout.HEADER_BOTTOM_GAP_RPX - 1,
        'headerSpace=' + r.headerSpace + ' pillBottom=' + bottomOfPill.toFixed(1));
    check(d.name + ' 占位覆盖系统安全区', r.headerSpace >= topInset, r.headerSpace + ' vs ' + topInset);
    check(d.name + ' 底图高度=视口', r.viewportHeight === Math.round(d.h * 750 / d.w), String(r.viewportHeight));
    const hitPx = cartHitRpx * r.mastheadScale * (d.w / 750);
    check(d.name + ' 购物车热区 ≥44px', hitPx >= 44, hitPx.toFixed(1) + 'px');
    const hitRight = r.mastheadLeft + (644 + cartHitRpx / 2) * r.mastheadScale;
    check(d.name + ' 购物车热区不越过胶囊', hitRight <= r.menuLeftRpx - layout.MENU_GAP_RPX + 1,
        'hitRight=' + hitRight.toFixed(1));
    if (d.w === 320 && !d.menu) {
        check(d.name + ' 避让从右侧占 94px 的胶囊', right * d.w / 750 <= d.w - 94);
    }
    check(d.name + ' 胶囊不可用自动回退', d.menu && d.menu.left > 0 ? r.hasMenu === true : r.hasMenu === false);
    geometries.push({ device: d.name, layout: r, right: +right.toFixed(1), pillBottom: +bottomOfPill.toFixed(1) });
}

// ---- 5. 预览内联几何与 JS 布局逐项一致（防止预览器另算一套） -----------
const preview = path.join(ROOT, 'output/miniprogram-shop-preview/index-375.html');
if (fs.existsSync(preview)) {
    const html = read(preview);
    const inline = /class="masthead" style="top:([\d.]+)px;left:([\d.]+)px;transform:scale\(([\d.]+)\)"/.exec(html);
    check('预览品牌条内联样式可解析', !!inline);
    if (inline) {
        const scale = 375 / 750;
        const r = layout.computeShopLayout({
            windowWidth: 375, windowHeight: 812, statusBarHeight: 44,
            topInset: 192, menu: { left: 289, top: 53, height: 27 },
        });
        check('预览 top 与 JS 布局一致', Math.abs(Number(inline[1]) - r.mastheadTop * scale) < 0.6,
            inline[1] + ' vs ' + (r.mastheadTop * scale).toFixed(2));
        check('预览 left 与 JS 布局一致', Math.abs(Number(inline[2]) - r.mastheadLeft * scale) < 0.6,
            inline[2] + ' vs ' + (r.mastheadLeft * scale).toFixed(2));
        check('预览 scale 与 JS 布局一致', Math.abs(Number(inline[3]) - r.mastheadScale) < 0.002,
            inline[3] + ' vs ' + r.mastheadScale);
    }
}

fs.mkdirSync(path.join(ROOT, 'output/miniprogram-shop-header'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/miniprogram-shop-header/layout-matrix.json'),
    JSON.stringify(geometries, null, 2));
console.log('=== 通过项 ===');
facts.forEach(f => console.log('  ' + f));
console.log('=== 问题 ===');
if (!problems.length) console.log('  无');
else problems.forEach(p => console.log('  ! ' + p));
console.log('总计 ' + (facts.length + problems.length) + ' 项，问题 ' + problems.length + ' 项');
process.exitCode = problems.length ? 1 : 0;
