// 小程序衣橱页浏览器级验收：静态预览的交互断言 + 多宽度截图 + 入口链路运行时验证。
//
// 前置：
//   python3 scripts/build-miniprogram-wardrobe-preview.py 390
//   python3 scripts/build-miniprogram-wardrobe-preview.py 320
// 用法：
//   node scripts/verify-miniprogram-wardrobe-browser.cjs
//   PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/Chrome node ...
//
// 依赖：仅 Playwright + 本机 Chrome；默认 WebView 渲染假设，不连接任何后端。
// /tmp 下的临时脚本不是交付物，本文件是唯一可复现入口。
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');
const OUT = path.join(ROOT, 'output', 'miniprogram-wardrobe-preview');
const PW = process.env.PLAYWRIGHT_MODULE || '/usr/local/lib/node_modules/playwright';
const CHROME = process.env.CHROME_PATH ||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const results = [];
function t(name, fn) {
    try { fn(); results.push('PASS ' + name); }
    catch (e) { results.push('FAIL ' + name + ': ' + e.message); }
}

// ---------- A. 入口链路运行时验证（Node wx 桩，不需要开发者工具） ----------
function runPage(rel, override) {
    const src = fs.readFileSync(path.join(MP, rel), 'utf8');
    const calls = [];
    let def = null;
    const wx = {
        navigateTo: (o) => calls.push(['navigateTo', o.url]),
        switchTab: (o) => calls.push(['switchTab', o.url]),
        navigateBack: () => calls.push(['navigateBack']),
        showToast: (o) => calls.push(['showToast', o.title, o.icon]),
        getWindowInfo: () => ({ windowWidth: 390, statusBarHeight: 47, screenHeight: 844, safeArea: { bottom: 810 } }),
        getMenuButtonBoundingClientRect: () => ({ top: 48, height: 32 }),
        onKeyboardHeightChange: () => {}, offKeyboardHeightChange: () => {},
        setStorageSync: () => {}, getStorageSync: () => null, removeStorageSync: () => {},
    };
    const sandbox = Object.assign({
        Page: (d) => { def = d; },
        wx: wx,
        getCurrentPages: () => [{ route: 'pages/index/index' }, { route: 'pages/wardrobe/wardrobe' }],
        require: (p) => {
            if (p.includes('wardrobe-catalog')) return require(path.join(MP, 'utils/wardrobe-catalog'));
            if (p.includes('safe-area')) return require(path.join(MP, 'utils/safe-area'));
            if (p.includes('store')) return { snapshot: () => ({ data: { snapshot: { hasBird: true, points: 0, food: 3, ledger: [] } } }) };
            if (p.includes('tab-bar')) return { syncSelected: () => {} };
            if (p.includes('nest-rules')) return { describeNestState: () => ({ needs: [], speech: '', emotion: 'idle' }), emotionArt: () => '' };
            if (p.includes('nest-layout')) return { readNestLayout: () => ({ tabBarHeight: 149 }) };
            if (p.includes('entry')) return { buildAdoptUrl: () => '/pages/adopt/adopt' };
            if (p.includes('config')) return { DEBUG_DEMO_BIRD_CODE: 'TEST' };
            return {};
        },
        console: console, module: { exports: {} }, exports: {},
        setTimeout: () => 0, clearTimeout: () => {}, Date: Date, Promise: Promise,
    }, override || {});
    vm.runInNewContext(src, sandbox, { filename: rel });
    assert.ok(def, 'Page() missing in ' + rel);
    const page = Object.assign({}, def, {
        data: JSON.parse(JSON.stringify(def.data || {})),
        setData(o) { Object.assign(this.data, o); },
    });
    return { page, calls, sandbox };
}

function entryTests() {
    t('小窝 dress → wardrobe 页', () => {
        const { page, calls } = runPage('pages/index/index.js');
        page.onTool({ currentTarget: { dataset: { key: 'dress' } } });
        assert.deepEqual(calls, [['navigateTo', '/pages/wardrobe/wardrobe']]);
    });
    t('小窝 checkin 未被误改，仍 → photo 页', () => {
        const { page, calls } = runPage('pages/index/index.js');
        page.onTool({ currentTarget: { dataset: { key: 'checkin' } } });
        assert.deepEqual(calls, [['navigateTo', '/pages/photo/photo']]);
    });
    t('我的衣橱 → 同一 wardrobe 页，不再开浮层', () => {
        const { page, calls } = runPage('pages/profile/profile.js');
        page.onWardrobe();
        assert.deepEqual(calls, [['navigateTo', '/pages/wardrobe/wardrobe']]);
        assert.equal('wardrobeVisible' in page.data, false);
    });
    t('衣橱返回有上一页 → navigateBack', () => {
        const { page, calls } = runPage('pages/wardrobe/wardrobe.js');
        page.onBack();
        assert.deepEqual(calls, [['navigateBack']]);
    });
    t('衣橱作为启动页 → switchTab 回小窝', () => {
        const { page, calls, sandbox } = runPage('pages/wardrobe/wardrobe.js');
        sandbox.getCurrentPages = () => [{ route: 'pages/wardrobe/wardrobe' }];
        page.onBack();
        assert.deepEqual(calls, [['switchTab', '/pages/index/index']]);
    });
    t('衣橱卡片点击只读提示、不改任何状态', () => {
        const { page, calls } = runPage('pages/wardrobe/wardrobe.js');
        page.onLoad();
        const before = JSON.stringify(page.data);
        page.onOutfitTap();
        assert.deepEqual(calls, [['showToast', '换装功能本期暂未开放', 'none']]);
        assert.equal(JSON.stringify(page.data), before);
    });
    t('底栏在衣橱页高亮小窝（与 H5 一致）', () => {
        const src = fs.readFileSync(path.join(MP, 'custom-tab-bar/index.js'), 'utf8');
        let def = null;
        const sb = {
            Component: (d) => { def = d; },
            wx: { getWindowInfo: () => ({ windowWidth: 390 }) },
            getCurrentPages: () => [{ route: 'pages/wardrobe/wardrobe' }],
            module: { exports: {} }, exports: {},
        };
        vm.runInNewContext(src, sb, { filename: 'custom-tab-bar/index.js' });
        const tabs = def.data.list.map(x => x.pagePath);
        assert.equal(tabs.includes('/pages/wardrobe/wardrobe'), false);
        assert.equal(tabs.indexOf('/pages/wardrobe/wardrobe'), -1);
        assert.equal(def.data.selected, 0);
    });
}

// ---------- B. 静态预览浏览器断言 + 截图 ----------
async function browserTests() {
    const { chromium } = require(PW);
    const browser = await chromium.launch({ headless: true, executablePath: CHROME });
    try {
        for (const width of [390, 320]) {
            const file = width === 390 ? 'index.html' : 'index-' + width + '.html';
            const abs = path.join(OUT, file);
            if (!fs.existsSync(abs)) throw Error('先运行 build-miniprogram-wardrobe-preview.py: ' + file);
            const context = await browser.newContext({
                viewport: { width: width, height: 844 }, deviceScaleFactor: 1,
            });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));

            await page.goto('file://' + abs + '?test=1');
            await page.waitForFunction(() => {
                const el = document.getElementById('test-out');
                return el && el.textContent.indexOf('RESULT=') >= 0;
            }, { timeout: 10000 });
            const text = (await page.locator('#test-out').textContent()).trim();
            const passed = text.split('\n').filter(l => l.startsWith('PASS ')).length;
            const failed = text.split('\n').filter(l => l.startsWith('FAIL '));
            t(width + 'px 页内交互断言（' + passed + ' 项）', () => {
                assert.equal(failed.length, 0, failed.join('; '));
                assert.ok(text.includes('RESULT=PASS'));
            });
            t(width + 'px 无 JS 报错', () => assert.equal(errors.length, 0, errors.join('; ')));

            // 首屏视口图：还原真机 fixed 底栏
            await page.goto('file://' + abs);
            await page.waitForTimeout(600);
            await page.screenshot({ path: path.join(OUT, 'mp-' + width + '-viewport.png') });
            // 完整长图：底栏移到页尾，避免 fixed 元素悬在 fullPage 中部
            await page.goto('file://' + abs + '?long=1');
            await page.waitForTimeout(600);
            await page.screenshot({ path: path.join(OUT, 'mp-' + width + '.png'), fullPage: true });
            await context.close();
        }
    } finally {
        await browser.close();
    }
}

(async () => {
    entryTests();
    await browserTests();
    for (const r of results) console.log((r.startsWith('PASS') ? '  ✓ ' : '  ✗ ') + r.slice(r.indexOf(' ') + 1));
    const failed = results.filter(r => r.startsWith('FAIL'));
    console.log('\n衣橱浏览器验收：' + (results.length - failed.length) + '/' + results.length + ' 通过' +
        (failed.length ? '，失败 ' + failed.length + ' 项' : '，0 问题'));
    if (failed.length) process.exit(1);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
