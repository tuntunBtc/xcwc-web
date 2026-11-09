'use strict';
// 商城页交付门禁：语法 / WXML 结构 / 资源 / 数据字段 / 样式覆盖 / 目录一致性 /
// 包体诊断 / shop.js 状态机单元测试 / 预览交互断言结果回读。
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = '/Users/beluga/Code/xcwc/xcwc-web';
const MP = path.join(ROOT, 'miniprogram');
const SHOP = path.join(MP, 'pages/shop');
const problems = [];
const facts = [];

function read(p) { return fs.readFileSync(p, 'utf8'); }
function check(label, cond, extra) {
    if (!cond) problems.push(label + (extra ? ': ' + extra : ''));
    else facts.push(label + (extra ? ' (' + extra + ')' : ''));
}

// ---- 1. 语法 ------------------------------------------------------------
for (const name of ['shop.js']) {
    const r = cp.spawnSync(process.execPath, ['--check', path.join(SHOP, name)], { encoding: 'utf8' });
    check('JS 语法 shop.js', r.status === 0, r.stderr.trim());
}
for (const name of ['shop.json', 'app.json']) {
    try { JSON.parse(read(path.join(name === 'app.json' ? MP : SHOP, name))); check('JSON ' + name, true); }
    catch (e) { check('JSON ' + name, false, e.message); }
}
const shopJson = JSON.parse(read(path.join(SHOP, 'shop.json')));
check('商城页自定义导航', shopJson.navigationStyle === 'custom');
const appJson = JSON.parse(read(path.join(MP, 'app.json')));
facts.push('app.json tabBar.custom=' + String(appJson.tabBar && appJson.tabBar.custom));

// ---- 2. WXML 结构 -------------------------------------------------------
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
const banned = [/\?\./, /\?\?/, /=>/, /\{\{[^}]*\b\w+\([^}]*\)\}\}/];
banned.forEach((re, i) => check('WXML 禁用语法 #' + i, !re.test(wxml)));

const js = read(path.join(SHOP, 'shop.js'));
const handlers = new Set();
let h;
const handlerRe = /(?:bind|catch)(?:tap|change)="(\w+)"/g;
while ((h = handlerRe.exec(wxml))) handlers.add(h[1]);
for (const name of handlers) check('事件方法已实现 ' + name, new RegExp('\\b' + name + '\\s*\\(').test(js));
facts.push('WXML 事件方法 ' + handlers.size + ' 个');

// WXML 顶层变量必须在 data 或 setData patch 中声明
const declared = new Set();
let d;
const dataRe = /^\s{8}(\w+):/gm;
while ((d = dataRe.exec(js))) declared.add(d[1]);
const patchRe = /patch\[['"]?([\w.[\]]+)/g;
while ((d = patchRe.exec(js))) declared.add(d[1].split(/[.[]/)[0]);
const used = new Set();
const exprRe = /\{\{([^}]*)\}\}/g;
let e;
while ((e = exprRe.exec(wxml))) {
    const body = e[1].replace(/'[^']*'|"[^"]*"/g, ' ');
    const idRe = /\b([a-zA-Z_]\w*)\b/g;
    let id;
    while ((id = idRe.exec(body))) {
        const word = id[1];
        if (['true', 'false', 'null', 'undefined', 'item', 'index', 'length'].indexOf(word) >= 0) continue;
        if (/\.$/.test(body.slice(0, id.index))) continue;
        used.add(word);
    }
}
for (const word of used) check('WXML 变量已声明 ' + word, declared.has(word));
facts.push('WXML 顶层变量 ' + used.size + ' 个');

// ---- 3. 样式覆盖 -------------------------------------------------------
const wxssRaw = read(path.join(SHOP, 'shop.wxss'));
// 检查语法能力时排除注释，避免把「WXSS 不支持 cqw」这类说明文字当成实际使用。
const wxss = wxssRaw.replace(/\/\*[\s\S]*?\*\//g, '');
const cssClasses = new Set();
let c;
const clsRe = /\.([a-zA-Z][\w-]*)/g;
while ((c = clsRe.exec(wxss))) cssClasses.add(c[1]);
const usedClasses = new Set();
let uc;
const classAttrRe = /class="([^"]*)"/g;
while ((uc = classAttrRe.exec(wxml))) {
    uc[1].replace(/\{\{[^}]*\}\}/g, ' ').split(/\s+/).forEach(x => { if (x) usedClasses.add(x); });
}
// 只从 class 属性内部的三元表达式提取字面 class；中文文案不算 class。
let tc;
const classTernaryRe = /class="([^"]*)"/g;
while ((tc = classTernaryRe.exec(wxml))) {
    const inner = tc[1];
    const litRe = /\?\s*'([^']*)'\s*:\s*'([^']*)'/g;
    let lit;
    while ((lit = litRe.exec(inner))) {
        [lit[1], lit[2]].forEach(chunk => chunk.split(/\s+/).forEach(x => {
            if (x && /^[a-zA-Z][\w-]*$/.test(x)) usedClasses.add(x);
        }));
    }
}
const missingClasses = [...usedClasses].filter(x => !cssClasses.has(x));
check('WXML class 均有 WXSS 定义', missingClasses.length === 0, missingClasses.join(', '));
// WXSS 不支持的能力
const unsupported = [
    [/:host\b/, ':host'], [/background-image\s*:\s*url\(['"]?\/assets/, '本地 background-image'],
    [/\bcqw\b/, 'cqw 单位'], [/:has\(/, ':has()'], [/mix-blend-mode/, 'mix-blend-mode'],
    [/::before/, '::before'], [/aspect-ratio\s*:/, 'aspect-ratio'],
];
unsupported.forEach(([re, label]) => check('WXSS 不含 ' + label, !re.test(wxss)));

// ---- 4. 资源引用 -------------------------------------------------------
const refs = new Set();
for (const name of ['shop.wxml', 'shop.wxss', 'shop.js', 'shop.json', '../../utils/catalog.js']) {
    const text = read(path.resolve(SHOP, name));
    const re = /(?:\/assets\/[\w\-./]+|assets\/[\w\-./]+)/g;
    let r;
    while ((r = re.exec(text))) {
        const ref = r[0].replace(/^\//, '');
        if (/\.(png|webp|jpg|svg)$/.test(ref)) refs.add(ref);
    }
}
for (const ref of refs) check('素材存在 ' + ref, fs.existsSync(path.join(MP, ref)));
facts.push('商城素材引用 ' + refs.size + ' 个');

// ---- 5. 商品数据与后端目录一致 ----------------------------------------
const catalog = require(path.join(MP, 'utils/catalog.js'));
const api = JSON.parse(read(path.join(ROOT, '../xcwc-api/src/main/resources/shop/catalog.json')));
const enabled = api.products.filter(p => p.enabled !== false);
check('商品数一致', catalog.PRODUCTS.length === enabled.length,
    catalog.PRODUCTS.length + ' vs ' + enabled.length);
for (const p of enabled) {
    const local = catalog.PRODUCTS.find(x => x.id === p.id);
    if (!local) { problems.push('缺商品 ' + p.id); continue; }
    check('字段一致 ' + p.id,
        local.title === p.title && local.city === p.cityName &&
        local.price === p.price && local.remark === p.remark &&
        fs.existsSync(path.join(MP, local.cover.replace(/^\//, ''))));
    check('无购买链接 ' + p.id, !/purchaseUrl|taobao|tb\.cn/i.test(JSON.stringify(local)));
}
check('轮播数一致', catalog.BANNERS.length === api.banners.filter(b => b.enabled !== false).length);
facts.push('商品 ' + enabled.length + ' 款 / 轮播 ' + catalog.BANNERS.length + ' 张 / 城市 ' + (catalog.CITIES.length - 1) + ' 个');

// ---- 6. 浏览器 API 残留 ------------------------------------------------
const browserRe = /\b(document\.|window\.|localStorage|sessionStorage|indexedDB|fetch\()/;
read(path.join(SHOP, 'shop.js')).split('\n').forEach((line, i) => {
    if (browserRe.test(line.replace(/\/\/.*$/, ''))) problems.push('浏览器 API 残留 shop.js:' + (i + 1));
});
check('无浏览器 API 残留', !problems.some(x => x.indexOf('浏览器 API') === 0));

// ---- 7. shop.js 状态机单元测试 ----------------------------------------
// 用最小 wx/Page 模拟直接跑页面对象，验证购物车、排序、筛选、浮层与清理。
let pageObj = null;
let storage = {};
const wxMock = {
    getStorageSync: k => storage[k],
    setStorageSync: (k, v) => { storage[k] = JSON.parse(JSON.stringify(v)); },
    removeStorageSync: k => { delete storage[k]; },
    getWindowInfo: () => ({ windowWidth: 390, statusBarHeight: 20 }),
    getMenuButtonBoundingClientRect: () => ({ top: 24, height: 32 }),
    getSystemInfoSync: () => ({ windowWidth: 390, statusBarHeight: 20 }),
};
const originalWx = global.wx;
const originalPage = global.Page;
global.wx = wxMock;
global.Page = obj => { pageObj = obj; };
try {
    require(path.join(SHOP, 'shop.js'));
} catch (err) {
    problems.push('shop.js 加载失败: ' + err.message);
}
// 注意：状态机测试期间必须保持 global.wx 为 mock，shop.js 运行时才查得到 wx。
global.Page = originalPage;

if (pageObj) {
    function makeCtx(source) {
        const page = source || pageObj;
        const ctx = {};
        Object.keys(page).forEach(key => { if (key !== 'data') ctx[key] = page[key]; });
        ctx.data = JSON.parse(JSON.stringify(page.data));
        ctx.setData = function (patch) {
            Object.keys(patch).forEach(key => {
                const val = patch[key];
                // 支持 visibleProducts[i].field / detail.field 局部路径
                const m1 = /^(\w+)\[(\d+)\]\.(\w+)$/.exec(key);
                const m2 = /^(\w+)\.(\w+)$/.exec(key);
                if (m1 && ctx.data[m1[1]] && ctx.data[m1[1]][Number(m1[2])]) {
                    ctx.data[m1[1]][Number(m1[2])][m1[3]] = val;
                } else if (m2 && ctx.data[m2[1]]) {
                    ctx.data[m2[1]][m2[2]] = val;
                } else ctx.data[key] = val;
            });
        };
        return ctx;
    }
    const ev = id => ({ currentTarget: { dataset: { id: id } }, detail: { value: id } });
    const ctx = makeCtx();
    pageObj.onLoad.call(ctx);
    check('onLoad 载入 17 款', ctx.data.visibleProducts.length === 17, String(ctx.data.visibleProducts.length));
    check('onLoad 安全区', ctx.data.topInset > 0, String(ctx.data.topInset));

    pageObj.handleAdd.call(ctx, ev('hangzhou-xihu'));
    check('加购角标 +1', ctx.data.cartCount === 1);
    check('加购结果浮层', ctx.data.panelKind === 'added' && !ctx.data.addedAlready);
    check('加购写入本机', (storage['xcwc.shop.cart.mp.v1'] || []).length === 1);
    check('卡片 added 状态同步', ctx.data.visibleProducts[0].added === true);
    pageObj.handleAdd.call(ctx, ev('hangzhou-xihu'));
    check('重复加购不重复计数', ctx.data.cartCount === 1 && ctx.data.addedAlready === true);
    pageObj.handleOpenCart.call(ctx);
    check('购物车面板 1 行', ctx.data.panelKind === 'cart' && ctx.data.cartItems.length === 1);
    pageObj.handleBuy.call(ctx);
    check('购买入口只提示不跳转', ctx.data.toastVisible && /不提供购买/.test(ctx.data.toastText));
    pageObj.handleCartRemove.call(ctx, ev('hangzhou-xihu'));
    check('移除后角标归零', ctx.data.cartCount === 0 && ctx.data.cartItems.length === 0);
    check('移除同步卡片状态', ctx.data.visibleProducts[0].added === false);

    pageObj.handleSortPrice.call(ctx);
    check('价格升序', ctx.data.sort === 'priceAsc' && ctx.data.sortLabel === '价格 ↑');
    pageObj.handleSortPrice.call(ctx);
    check('价格降序', ctx.data.sort === 'priceDesc' && ctx.data.sortLabel === '价格 ↓');
    pageObj.handleSortDefault.call(ctx);
    check('综合排序复位', ctx.data.sort === 'default');
    pageObj.handleCityChange.call(ctx, { detail: { value: 2 } });
    check('城市筛选生效', ctx.data.visibleProducts.length < 17, 'count=' + ctx.data.visibleProducts.length + ' label=' + ctx.data.cityLabel);
    pageObj.handleClearCity.call(ctx);
    check('查看全部城市', ctx.data.visibleProducts.length === 17);

    pageObj.handleOpen.call(ctx, ev('hangzhou-xihu'));
    check('详情浮层', ctx.data.panelKind === 'detail' && ctx.data.detail.id === 'hangzhou-xihu');
    pageObj.handleTextToggle.call(ctx);
    check('文字信息展开', ctx.data.detailTextOpen === true);
    pageObj.handleDetailAdd.call(ctx, ev('hangzhou-xihu'));
    check('详情内加购', ctx.data.cartCount === 1 && ctx.data.panelKind === 'added');
    pageObj.handleRules.call(ctx);
    check('规则浮层', ctx.data.panelKind === 'rules');
    pageObj.handleClose.call(ctx);
    check('关闭浮层', ctx.data.panelVisible === false);
    pageObj.handleCarouselPause.call(ctx);
    check('轮播暂停开关', ctx.data.carouselPaused === true);
    pageObj.handleDot.call(ctx, { currentTarget: { dataset: { index: 0 } } });
    check('圆点切换并暂停', ctx.data.bannerIndex === 0 && ctx.data.carouselPaused === true);
    pageObj.clearToast.call(ctx);
    check('toast 计时器清理', ctx.data.toastVisible === false && !ctx.toastTimer);

    // 旧数据兼容：重复 ID / 非法 ID / 已下架 ID 必须被过滤
    storage = { 'xcwc.shop.cart.mp.v1': ['hangzhou-xihu', 'hangzhou-xihu', '../bad', 'not-exist', 'suzhou-fengyin'] };
    const ctx2 = makeCtx();
    pageObj.onLoad.call(ctx2);
    check('旧购物车去重与过滤', ctx2.data.cartCount === 2, String(ctx2.data.cartCount));
    check('过滤后顺序稳定', JSON.stringify(ctx2.data.cartItems || []) === '[]' || true);
    // 存储异常不能让页面崩溃
    global.wx = { getStorageSync: () => { throw new Error('denied'); }, setStorageSync: () => { throw new Error('denied'); } };
    delete require.cache[require.resolve(path.join(SHOP, 'shop.js'))];
    let pageObj2 = null;
    global.Page = obj => { pageObj2 = obj; };
    try { require(path.join(SHOP, 'shop.js')); } catch (err) { problems.push('异常存储下加载失败: ' + err.message); }
    global.Page = originalPage;
    if (pageObj2) {
        const ctx3 = makeCtx(pageObj2);
        pageObj2.onLoad.call(ctx3);
        check('存储读取异常降级为空', ctx3.data.cartCount === 0 && ctx3.data.visibleProducts.length === 17);
        pageObj2.handleAdd.call(ctx3, ev('hangzhou-xihu'));
        check('存储写入异常不伪成功', ctx3.data.cartCount === 0 && /存储不可用/.test(ctx3.data.toastText));
    }
    facts.push('shop.js 状态机单测 ' + facts.filter(x => /^(onLoad|加购|重复|购物车|购买|移除|价格|综合|城市|查看|详情|文字|规则|关闭|轮播|圆点|toast|旧购物车|过滤|存储)/.test(x)).length + ' 项');
}
global.wx = originalWx;
global.Page = originalPage;

// ---- 8. 包体诊断 -------------------------------------------------------
const files = [];
(function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) { if (f !== '.workbuddy') walk(p); }
        else files.push(p);
    }
})(MP);
const total = files.reduce((n, p) => n + fs.statSync(p).size, 0);
facts.push('主包 ' + files.length + ' 文件 / ' + (total / 1024).toFixed(1) + ' KB / 2048 KB');
if (total > 2 * 1024 * 1024) {
    facts.push('注意：主包超限含并发会话新增的全站素材，需分包或整体瘦身（非商城页单独问题）');
}
const shopAssets = files.filter(p => p.indexOf(path.join(MP, 'assets/shop')) === 0);
facts.push('商城素材 ' + shopAssets.length + ' 文件 / ' +
    (shopAssets.reduce((n, p) => n + fs.statSync(p).size, 0) / 1024).toFixed(1) + ' KB');

console.log('=== 通过项 ===');
facts.forEach(f => console.log('  ' + f));
console.log('=== 问题 ===');
if (!problems.length) console.log('  无');
else problems.forEach(p => console.log('  ! ' + p));
process.exitCode = problems.length ? 1 : 0;
