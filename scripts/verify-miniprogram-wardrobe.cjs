// 小程序衣橱页静态验收：结构、绑定、资源、数据、文案、入口与 H5 一致性。
// 只读校验，不修改工程；纯 Node 标准库，不依赖微信开发者工具。
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');
const PAGE = path.join(MP, 'pages/wardrobe');
const problems = [];
const checks = [];
function check(name, fn) {
    try { fn(); checks.push(name); }
    catch (e) { problems.push(name + ': ' + e.message); }
}
function read(p) { return fs.readFileSync(p, 'utf8'); }
function json(p) { return JSON.parse(read(p)); }
function exists(p) { assert.ok(fs.existsSync(p), 'missing ' + path.relative(ROOT, p)); }

// ---------- 1. 四件套与 JSON ----------
const js = read(path.join(PAGE, 'wardrobe.js'));
const wxml = read(path.join(PAGE, 'wardrobe.wxml'));
const wxss = read(path.join(PAGE, 'wardrobe.wxss'));
const pageJson = json(path.join(PAGE, 'wardrobe.json'));
const appJson = json(path.join(MP, 'app.json'));
const catalog = require(path.join(MP, 'pages/wardrobe/wardrobe-catalog'));

check('四件套齐全', () => {
    for (const f of ['wardrobe.js', 'wardrobe.wxml', 'wardrobe.wxss', 'wardrobe.json']) {
        exists(path.join(PAGE, f));
    }
});
check('wardrobe.json 自定义导航 + 复用 custom-tab-bar', () => {
    assert.equal(pageJson.navigationStyle, 'custom');
    assert.equal(pageJson.usingComponents['tab-bar'], '/custom-tab-bar/index');
    exists(path.join(MP, 'custom-tab-bar/index.js'));
    exists(path.join(MP, 'custom-tab-bar/index.wxml'));
});
check('app.json 注册 wardrobe 页且未破坏既有路由', () => {
    const subpackages = appJson.subpackages || [];
    for (const page of ['adopt', 'photo', 'wardrobe']) {
        const root = 'pages/' + page;
        assert.ok(subpackages.some(pkg => pkg.root === root && !pkg.independent && pkg.pages.includes(page)), 'lost subpackage ' + page);
        assert.ok(!appJson.pages.includes(root + '/' + page), 'subpackage also in main package ' + page);
    }
    assert.equal(appJson.tabBar.custom, true);
    assert.equal(appJson.tabBar.list.length, 4, 'tabBar must stay 4 items');
    for (const tab of appJson.tabBar.list) assert.ok(appJson.pages.includes(tab.pagePath), 'tab missing from main package ' + tab.pagePath);
});

// ---------- 2. 素材与 H5 一致性 ----------
const SKINS = ['osmanthus', 'peach', 'bamboo', 'sakura', 'scholar', 'moon', 'jade', 'pilgrim'];
const H5_COPIES = [
    ['dist/assets/wardrobe/felt/scene-top-v2-900.webp', 'miniprogram/pages/wardrobe/assets/felt/scene-top.webp'],
    ['dist/assets/wardrobe/felt/scene-lower-v2-900.webp', 'miniprogram/pages/wardrobe/assets/felt/scene-lower.webp'],
    ['dist/assets/nest/felt/idle-640.webp', 'miniprogram/pages/wardrobe/assets/felt/idle-640.webp'],
];
for (const n of SKINS) {
    H5_COPIES.push([
        'dist/assets/wardrobe/huangying/' + n + '-320.webp',
        'miniprogram/pages/wardrobe/assets/huangying/' + n + '-320.webp',
    ]);
}
check('11 张 H5 原素材逐字节一致（SHA-256）', () => {
    const crypto = require('node:crypto');
    for (const [a, b] of H5_COPIES) {
        const pa = path.join(ROOT, a), pb = path.join(ROOT, b);
        exists(pa); exists(pb);
        const ha = crypto.createHash('sha256').update(fs.readFileSync(pa)).digest('hex');
        const hb = crypto.createHash('sha256').update(fs.readFileSync(pb)).digest('hex');
        assert.equal(hb, ha, 'hash mismatch ' + b);
    }
});
check('烘焙底板存在且非空', () => {
    for (const f of ['panel-head.webp', 'panel-card.webp']) {
        exists(path.join(MP, 'pages/wardrobe/assets/felt', f));
        assert.ok(fs.statSync(path.join(MP, 'pages/wardrobe/assets/felt', f)).size > 4000, f + ' too small');
    }
});
check('WXML 引用的全部本地资源存在', () => {
    const refs = new Set();
    for (const m of wxml.matchAll(/src="(\/(?:pages\/wardrobe\/)?assets\/[^"\s}]+)/g)) refs.add(m[1]);
    for (const m of js.matchAll(/'(\/(?:pages\/wardrobe\/)?assets\/[^']+)'/g)) refs.add(m[1]);
    assert.ok(refs.size >= 4, 'no asset refs found');
    for (const r of refs) exists(path.join(MP, r.replace(/^\//, '')));
    checks.push('  资源引用 ' + refs.size + ' 个');
});

// ---------- 3. 目录数据与 H5 catalog 一致 ----------
const h5Catalog = read(path.join(ROOT, 'src/wardrobe-catalog.mjs'));
check('8 套服装 id/顺序/名称与 H5 WARDROBE_SKINS 一致', () => {
    assert.equal(catalog.OUTFITS.length, 8);
    const ids = ['huangying_osmanthus', 'huangying_peach', 'huangying_bamboo', 'huangying_sakura',
                 'huangying_scholar', 'huangying_moon', 'huangying_jade', 'huangying_pilgrim'];
    const names = ['桂花披风', '桃花披风', '竹影披风', '樱花披风',
                   '江南书生', '月白花嫁', '青蛇仙子', '小小行者'];
    catalog.OUTFITS.forEach((item, i) => {
        assert.equal(item.id, ids[i], 'id at ' + i);
        assert.equal(item.name, names[i], 'name at ' + i);
        assert.equal(item.price, i < 4 ? 30 : 70);
        assert.ok(h5Catalog.includes(item.id), 'H5 catalog missing ' + item.id);
        assert.ok(h5Catalog.includes(item.name), 'H5 catalog missing ' + item.name);
        exists(path.join(MP, item.thumb.replace(/^\//, '')));
    });
});
check('不复制光晕（H5 只展示 kind=outfit）', () => {
    assert.ok(!catalog.OUTFITS.some(o => /glow/.test(o.id)));
    assert.equal(catalog.CLOSED_NOTICE, '换装功能本期暂未开放');
});

// ---------- 4. WXML 变量 / 事件绑定闭环 ----------
check('WXML 事件处理器在 JS 中全部定义', () => {
    const handlers = new Set();
    for (const m of wxml.matchAll(/(?:bind|catch)tap="([A-Za-z0-9_]+)"/g)) handlers.add(m[1]);
    assert.ok(handlers.size >= 2);
    for (const h of handlers) {
        assert.ok(new RegExp('\\b' + h + '\\s*\\(').test(js), 'undefined handler ' + h);
    }
    checks.push('  处理器 ' + [...handlers].join(','));
});
check('WXML 变量全部在 data 或 wx:for 作用域内', () => {
    const allowed = new Set(['item', 'index', 'true', 'false', 'null', 'undefined']);
    const declared = new Set();
    for (const m of wxml.matchAll(/\{\{([^}]+)\}\}/g)) {
        // 先剥掉字符串字面量，避免把 class 名 'is-left' 里的 is 当成变量
        const expr = m[1].replace(/'[^']*'|"[^"]*"/g, '');
        for (const v of expr.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
            if (!allowed.has(v[0]) && !['isLeft', 'thumb', 'name', 'id'].includes(v[0])) declared.add(v[0]);
        }
    }
    // 从 JS data 中收集顶层字段
    const dataBlock = js.slice(js.indexOf('data: {'), js.indexOf('onLoad('));
    for (const v of declared) {
        assert.ok(new RegExp('\\b' + v + '\\s*:').test(dataBlock), 'undeclared variable ' + v);
    }
    checks.push('  变量 ' + [...declared].join(','));
});
check('WXML 标签平衡 + 无浏览器 API', () => {
    // 剥掉注释，避免注释里的 <image> 文字被当成标签
    const markup = wxml.replace(/<!--[\s\S]*?-->/g, '');
    const stack = [];
    for (const m of markup.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b[^>]*?(\/?)>/g)) {
        const [, close, tag, selfClose] = m;
        if (close) {
            assert.equal(stack.pop(), tag, 'unbalanced close ' + tag);
        } else if (!selfClose) {
            stack.push(tag);
        }
    }
    assert.equal(stack.length, 0, 'unclosed tags: ' + stack.join(','));
    assert.ok(!/\bdocument\.|\bwindow\.|localStorage|querySelector/.test(js), 'browser API leak');
});
check('WXSS 无 WXML 不兼容语法（本地 background-image / :has / cqw / ::before）', () => {
    // 剥掉注释：注释里描述被替换掉的 H5 语法属说明文字，不是实际样式
    const css = wxss.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/url\(\s*['"]?\/assets/.test(css), 'local background-image');
    assert.ok(!/:has\(/.test(css));
    assert.ok(!/::before|::after/.test(css));
    assert.ok(!/\d+cqw/.test(css));
    assert.ok(!/grid-template-columns/.test(css));
});
check('WXSS 关键换算值与 H5 实测几何一致', () => {
    // H5 在 390px 视口实测：hero 195、head 118、note 58、card 317、wear 44
    const expect = [
        ['scene-top height 63cqw', /\.scene-top[\s\S]*?height:\s*472rpx/],
        ['下段背景与上段重叠淡接', /\.scene-top\s*\{[^}]*mask-image:[^}]*\}[\s\S]*?\.scene-lower\s*\{[^}]*top:\s*354rpx/],
        ['相邻下段背景镜像相接', /\.scene-lower-tile\.is-reversed\s*\{[^}]*transform:\s*scaleY\(-1\)/],
        ['hero min-height 195px', /\.hero\s*\{[\s\S]*?min-height:\s*375rpx/],
        ['head min-height 118px', /\.head\s*\{[\s\S]*?min-height:\s*227rpx/],
        ['note min-height 58px', /\.note\s*\{[\s\S]*?min-height:\s*112rpx/],
        ['card min-height 317px', /\.outfit-card\s*\{[\s\S]*?min-height:\s*610rpx/],
        ['wear min-height 44px', /\.wear\s*\{[\s\S]*?min-height:\s*85rpx/],
        ['actor width 58%', /\.actor\s*\{[\s\S]*?width:\s*58%/],
        ['two-column calc', /width:\s*calc\(\(100% - 20rpx\) \/ 2\)/],
        ['disabled wear styling', /\.wear\.is-disabled\s*\{[\s\S]*?#aaa984/],
    ];
    for (const [label, re] of expect) assert.ok(re.test(wxss), label);
});

// ---------- 5. 文案与网页端当前效果一致 ----------
const h5Account = read(path.join(ROOT, 'src/account-pages.js'));
check('页面文案逐字对齐 H5 feltWardrobeContent', () => {
    const phrases = [
        '我的衣橱', '服装展示 · 暂未开放',
        '换装功能本期暂未开放，服装仅作展示。',
        '小黄莺的新衣', '套装扮', '服装展示', '暂未开放', '← 返回',
        'BUJIDAO · MY ISLAND',
    ];
    for (const p of phrases) assert.ok(wxml.includes(p), 'missing UI text: ' + p);
    for (const p of ['我的衣橱', '服装展示 · 暂未开放', '换装功能本期暂未开放，服装仅作展示。',
                     '小黄莺的新衣', '套装扮', '服装展示', '暂未开放']) {
        assert.ok(h5Account.includes(p), 'H5 source missing: ' + p);
    }
});
check('本机体验说明与 H5 语义一致（平台措辞适配）', () => {
    assert.ok(wxml.includes('本机体验 · 无需登录'));
    assert.ok(wxml.includes('清除小程序数据或换设备后不会自动恢复'));
});

// ---------- 6. 交互自测：Page 桩 + 假 wx ----------
check('页面逻辑自测（返回 / 卡片点击 / 安全区 / 只读边界）', () => {
    const calls = [];
    let pageDef = null;
    let width = 600;
    let navigation;
    const fakeWx = {
        showToast: (o) => calls.push(['showToast', o.title]),
        navigateBack: (o) => { navigation = o; calls.push(['navigateBack']); },
        switchTab: (o) => { navigation = o; calls.push(['switchTab', o.url]); },
        navigateTo: (o) => calls.push(['navigateTo', o.url]),
        getWindowInfo: () => ({ windowWidth: width, statusBarHeight: 47 }),
        getMenuButtonBoundingClientRect: () => ({ top: 58, height: 32 }),
    };
    const safeArea = { wx: fakeWx, module: { exports: {} } };
    vm.runInNewContext(read(path.join(MP, 'utils/safe-area.js')), safeArea);
    const sandbox = {
        Page: (def) => { pageDef = def; },
        wx: fakeWx,
        getCurrentPages: () => [{ route: 'pages/index/index' }, { route: 'pages/wardrobe/wardrobe' }],
        require: (rel) => {
            if (rel.includes('wardrobe-catalog')) return catalog;
            if (rel.includes('safe-area')) return safeArea.module.exports;
            throw Error('unexpected require ' + rel);
        },
        console: console,
        module: { exports: {} },
        exports: {},
    };
    vm.runInNewContext(js, sandbox, { filename: 'wardrobe.js' });
    assert.ok(pageDef, 'Page() not called');
    const page = Object.assign({}, pageDef, {
        data: JSON.parse(JSON.stringify(pageDef.data)),
        setData(o) { Object.assign(this.data, o); },
    });

    // onLoad：安全区换算、8 套服装和 8 张下段背景
    page.onLoad();
    assert.equal(page.data.topInset, 124);
    assert.equal(page.data.outfits.length, 8);
    assert.equal(page.data.outfitCount, 8);
    assert.equal(page.data.lowerTiles.length, 8);
    assert.equal(page.data.outfits[0].isLeft, true);
    assert.equal(page.data.outfits[1].isLeft, false);
    assert.equal(page.data.outfits[7].isLeft, false);
    width = 320;
    page.onResize();
    assert.ok(page.data.topInset * width / 750 > 90, '缩窄后返回按钮仍在胶囊下方');
    assert.match(wxss, /\.back\s*\{[^}]*min-height:\s*44px/);

    // 返回：有上一页 → navigateBack
    calls.length = 0;
    page.onBack();
    page.onBack();
    assert.deepEqual(calls, [['navigateBack']]);
    navigation.fail();
    navigation.complete();
    assert.deepEqual(calls.at(-1), ['showToast', '返回失败，请重试']);

    // 返回：作为启动页 → 回小窝
    calls.length = 0;
    sandbox.getCurrentPages = () => [{ route: 'pages/wardrobe/wardrobe' }];
    page.onBack();
    assert.deepEqual(calls, [['switchTab', '/pages/index/index']]);
    navigation.complete();

    // 卡片点击：只提示，不写任何状态、不跳转
    calls.length = 0;
    const before = JSON.stringify(page.data);
    page.onOutfitTap({ currentTarget: { dataset: { id: 'huangying_osmanthus' } } });
    assert.deepEqual(calls, [['showToast', '换装功能本期暂未开放']]);
    assert.equal(JSON.stringify(page.data), before, 'card tap mutated state');

    // 无兑换/穿戴/叽分接口痕迹
    assert.ok(!/redeem|equip|deduct|points\s*-=|setStorageSync/.test(js),
        'page must not implement unopened purchase/equip logic');
});

// ---------- 7. 入口：小窝换装 + 我的衣橱 ----------
const indexJs = read(path.join(MP, 'pages/index/index.js'));
const profileJs = read(path.join(MP, 'pages/profile/profile.js'));
const profileWxml = read(path.join(MP, 'pages/profile/profile.wxml'));
check('小窝「换装」入口跳 wardrobe 页', () => {
    assert.ok(indexJs.includes('{ key: \'dress\', label: \'换装\''));
    assert.ok(/key === 'dress'[\s\S]{0,160}openToolPage\('\/pages\/wardrobe\/wardrobe'/.test(indexJs),
        'dress branch missing wardrobe route');
    assert.ok(!indexJs.includes("showToast('换装暂未接入')"), 'stale toast remains');
});
check('「我的 → 我的衣橱」复用同一路由', () => {
    assert.ok(profileWxml.includes('我的衣橱'));
    assert.ok(profileWxml.includes('bindtap="onWardrobe"'));
    assert.ok(/onWardrobe\(\)[\s\S]{0,320}navigateTo\(\{\s*url: '\/pages\/wardrobe\/wardrobe'/.test(profileJs));
    assert.ok(!/wx:if="\{\{wardrobeVisible\}\}"/.test(profileWxml), 'stale wardrobe overlay remains');
});
check('H5 两个入口确实共用 wardrobe 路由', () => {
    // 不依赖带内容指纹的文件名：按前缀找当前构建产物
    const runtimeDir = path.join(ROOT, 'dist/runtime');
    const nestFile = fs.readdirSync(runtimeDir).find(f => /^nest\.[0-9a-f]+\.js$/.test(f));
    assert.ok(nestFile, 'dist/runtime/nest.*.js missing; run npm run build');
    assert.ok(read(path.join(runtimeDir, nestFile)).includes("nav('wardrobe')"), 'nest dress entry');
    assert.ok(read(path.join(ROOT, 'src/account-pages.js')).includes('data-go="wardrobe"'));
});
check('「我的」页不再残留旧衣橱浮层状态', () => {
    assert.ok(!/wardrobeVisible/.test(profileJs), 'stale wardrobeVisible in profile.js');
});

// ---------- 8. 包体 ----------
check('衣橱普通分包源码体积记录', () => {
    let total = 0, count = 0;
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === '.DS_Store') continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else { total += fs.statSync(p).size; count += 1; }
        }
    };
    walk(PAGE);
    checks.push('  衣橱分包源码 ' + count + ' 文件 / ' + (total / 1024).toFixed(1) + ' KiB，编译体积以开发者工具为准');
});

// ---------- 输出 ----------
console.log('通过 ' + checks.length + ' 项：');
for (const c of checks) console.log('  ✓ ' + c);
if (problems.length) {
    console.error('\n失败 ' + problems.length + ' 项：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
}
console.log('\n衣橱页静态验收：0 问题');
