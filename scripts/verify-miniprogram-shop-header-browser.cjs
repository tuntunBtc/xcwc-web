'use strict';
// 商城页「全屏底图 + 品牌条等比避让胶囊」浏览器等价渲染验收。
// 复用 /tmp 的轻量 CDP 驱动（不依赖 Playwright），对自包含预览做多机型量测与截图。
// 说明：H5 近似渲染 ≠ 微信原生渲染，胶囊矩形在预览里按机型模拟注入。
const fs = require('node:fs');
const path = require('node:path');
const lib = require('/tmp/xcwc-nest-bg-probe.cjs');

const ROOT = '/Users/beluga/Code/xcwc/xcwc-web';
const DIR = path.join(ROOT, 'output', 'miniprogram-shop-preview');
const OUT = path.join(ROOT, 'output', 'miniprogram-shop-header');
fs.mkdirSync(OUT, { recursive: true });

const MEASURE = `(()=>{
  const q=s=>document.querySelector(s);
  const r=e=>{if(!e)return null;const x=e.getBoundingClientRect();return {x:+x.x.toFixed(1),y:+x.y.toFixed(1),w:+x.width.toFixed(1),h:+x.height.toFixed(1),right:+x.right.toFixed(1),bottom:+x.bottom.toFixed(1)}};
  const cs=e=>e?getComputedStyle(e):null;
  const phone=q('.phone');
  return {
    viewport:{w:innerWidth,h:innerHeight},
    phone:r(phone),
    scene:{rect:r(q('.page-scene')),bg:cs(q('.page-scene'))?.backgroundImage?.slice(0,40),position:cs(q('.page-scene'))?.position,display:cs(q('.page-scene'))?.display},
    statusSpace:r(q('.status-space')),
    masthead:{rect:r(q('.masthead')),transform:cs(q('.masthead'))?.transform,origin:cs(q('.masthead'))?.transformOrigin,top:q('.masthead')?.style.top,left:q('.masthead')?.style.left},
    hero:r(q('.hero')),
    capsule:r(q('.capsule')),
    red:r(q('.guide-red')),
    yellow:r(q('.guide-yellow')),
    shopPageBg:cs(q('.shop-page'))?.backgroundColor,
    appBg:cs(q('.app'))?.backgroundImage,
    overflowX:document.documentElement.scrollWidth-innerWidth,
    imgErrors:[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>(i.getAttribute('src')||'').slice(0,60)),
  };
})()`;

const CASES = [
    { name: 'before-375', width: 375, height: 812, file: 'before-375.html', query: '?guides=1' },
    { name: 'after-375', width: 375, height: 812, file: 'index-375.html', query: '?guides=1' },
    { name: 'after-375-clean', width: 375, height: 812, file: 'index-375.html', query: '' },
    { name: 'after-320', width: 320, height: 568, file: 'index-320.html', query: '?guides=1' },
    { name: 'after-390', width: 390, height: 844, file: 'index.html', query: '?guides=1' },
    { name: 'after-430', width: 430, height: 932, file: 'index-430.html', query: '?guides=1' },
];

function check(name, condition, extra) {
    return { name, pass: !!condition, detail: extra === undefined ? '' : String(extra) };
}

async function runCase(s, c) {
    const url = 'file://' + path.join(DIR, c.file) + c.query;
    await lib.navigate(s.cdp, url);
    const d = await s.cdp.evaluate(MEASURE);
    const shot = path.join(OUT, c.name + '.png');
    await s.cdp.screenshot(shot);
    const results = [];
    const m = d.masthead.rect, cap = d.capsule, hero = d.hero, scene = d.scene.rect;
    const isBefore = c.name.indexOf('before-') === 0;
    const hasGuides = c.query.indexOf('guides=1') >= 0;

    results.push(check('无横向溢出', d.overflowX <= 1, 'overflowX=' + d.overflowX));
    results.push(check('无图片加载失败', d.imgErrors.length === 0, d.imgErrors.join(',')));

    if (isBefore) {
        // 改前：没有整页底图，状态栏与内容区各画一段渐变（断层来源）。
        results.push(check('改前确无整页底图', d.scene.display === 'none', d.scene.display));
        results.push(check('改前状态栏与内容区为两段渐变',
            /gradient/.test(d.appBg || ''), (d.appBg || '').slice(0, 60)));
        // 改前：品牌条在流内，宽度铺满且位置在黄框一带；会横向压到胶囊。
        results.push(check('改前品牌条宽于胶囊左缘（复现问题）',
            m.right > cap.x, 'masthead.right=' + m.right + ' capsule.left=' + cap.x));
        results.push(check('改前品牌条位于黄框高度带',
            m.y >= d.yellow.y - 12 && m.y <= d.yellow.bottom + 12,
            'masthead.y=' + m.y + ' yellow=' + d.yellow.y + '..' + d.yellow.bottom));
    } else {
        // 预览里 .page-scene 是绝对定位贴在 .phone 上（真机为 fixed 贴视口），
        // 因此用「相对 phone 的 top」判定是否从最上沿开始。
        results.push(check('底图从页面最上沿开始且宽度等于屏宽',
            scene && Math.abs(scene.y - d.phone.y) < 1 && Math.abs(scene.w - d.phone.w) < 1,
            scene && ('scene.y=' + scene.y + ' phone.y=' + d.phone.y + ' w=' + scene.w)));
        results.push(check('底图覆盖整页内容高度',
            scene && scene.h >= d.phone.h - 1,
            scene && ('scene.h=' + scene.h + ' phone.h=' + d.phone.h)));
        results.push(check('底图已赋图且内容层透明',
            d.scene.display !== 'none' && /url\(/.test(d.scene.bg || '') &&
            !/gradient/.test(d.appBg || ''), (d.scene.bg || '').slice(0, 30) + ' appBg=' + (d.appBg || '').slice(0, 30)));
        const ratio = m.w / m.h;
        results.push(check('品牌条保持 726/128 原始宽高比（等比缩放而非压扁）',
            Math.abs(ratio - 726 / 128) < 0.02, 'ratio=' + ratio.toFixed(4)));
        results.push(check('品牌条未顶到状态栏文字',
            m.y - d.phone.y >= 28, 'masthead.y-phone.y=' + (m.y - d.phone.y).toFixed(1)));
        results.push(check('轮播不压住品牌条',
            hero.y >= m.bottom - 1, 'hero.y=' + hero.y + ' masthead.bottom=' + m.bottom));
        results.push(check('品牌条 transform 为等比 scale',
            /matrix\(([\d.]+), 0, 0, \1/.test(d.masthead.transform || ''), d.masthead.transform));
        if (hasGuides) {
            results.push(check('品牌条右边界不遮挡胶囊',
                m.right <= cap.x - 8, 'masthead.right=' + m.right + ' capsule.left=' + cap.x));
            results.push(check('品牌条落在红框水平范围',
                m.x >= d.red.x - 8 && m.right <= d.red.right + 8,
                'masthead=' + m.x + '..' + m.right + ' red=' + d.red.x + '..' + d.red.right));
            results.push(check('品牌条与红框垂直带重叠',
                m.y < d.red.bottom && m.bottom > d.red.y,
                'masthead=' + m.y + '..' + m.bottom + ' red=' + d.red.y + '..' + d.red.bottom));
        }
    }
    return { case: c, data: d, results, shot };
}

// 交互回归：① 预览自带的 22 项断言；② 缩放后购物车热区仍可真实点击。
async function interactionChecks() {
    const results = [];
    const s = await lib.launch(390, 844);
    try {
        await lib.navigate(s.cdp, 'file://' + path.join(DIR, 'index.html') + '?test=1');
        const out = await s.cdp.evaluate("document.querySelector('#test-out').textContent");
        const fails = (out.match(/^FAIL /gm) || []).length;
        results.push(check('预览交互断言 0 失败', /TOTAL \d+ \/ FAILED 0/.test(out) && fails === 0,
            out.split('\n').slice(-1)[0]));

        await lib.navigate(s.cdp, 'file://' + path.join(DIR, 'index.html'));
        const hit = await s.cdp.evaluate(`(()=>{const r=document.querySelector('.cart-hit').getBoundingClientRect();
            return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()`);
        await s.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
        await s.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
        await lib.wait(250);
        const panel = await s.cdp.evaluate(`(()=>({
            visible: !document.querySelector('#overlay').classList.contains('hidden'),
            title: document.querySelector('#panelTitle').textContent,
            hasEmpty: !!document.querySelector('.cart-empty'),
        }))()`);
        results.push(check('等比缩放后购物车热区可点', panel.visible && /购物车/.test(panel.title),
            'hit=' + hit.w.toFixed(1) + 'x' + hit.h.toFixed(1) + ' panel=' + JSON.stringify(panel)));
        results.push(check('透明热区 ≥44px', hit.w >= 44 && hit.h >= 44,
            hit.w.toFixed(1) + 'x' + hit.h.toFixed(1)));
        results.push(check('购物车空态正常', panel.hasEmpty === true));

        // 把预览的底图切回真机的 fixed + viewportHeight，滚动到页尾复核：
        // 底图仍贴视口顶端且高度不变，底栏附近不会露出兜底纯色。
        await lib.navigate(s.cdp, 'file://' + path.join(DIR, 'index.html'));
        await s.cdp.evaluate(`(()=>{const e=document.querySelector('.page-scene');
            e.style.position='fixed'; e.style.height='844px'; window.scrollTo(0,document.body.scrollHeight); return true})()`);
        await lib.wait(250);
        const fixed = await s.cdp.evaluate(`(()=>{const r=document.querySelector('.page-scene').getBoundingClientRect();
            return {y:r.y,h:r.height,w:r.width,position:getComputedStyle(document.querySelector('.page-scene')).position,
                    scrollY:window.scrollY,bg:getComputedStyle(document.querySelector('.page-scene')).backgroundImage.slice(0,20)}})()`);
        results.push(check('滚动到页尾底图仍贴住视口顶端', Math.abs(fixed.y) < 1 && Math.abs(fixed.h - 844) < 1,
            'y=' + fixed.y + ' h=' + fixed.h + ' scrollY=' + fixed.scrollY));
        results.push(check('页尾底图宽度仍等于屏宽', Math.abs(fixed.w - 390) < 1, String(fixed.w)));
        results.push(check('页尾底图仍有纹理', /url\(/.test(fixed.bg), fixed.bg));
        await s.cdp.screenshot(path.join(OUT, 'page-bottom-390.png'));
    } finally {
        lib.close(s);
        await lib.wait(350);
    }
    return results;
}

(async () => {
    const report = [];
    for (const c of CASES) {
        const s = await lib.launch(c.width, c.height);
        try {
            report.push(await runCase(s, c));
        } finally {
            lib.close(s);
            await lib.wait(350);
        }
    }
    const interaction = await interactionChecks();
    const failed = [];
    for (const r of report) {
        console.log('--- ' + r.case.name + ' ---');
        for (const item of r.results) {
            console.log((item.pass ? '  PASS ' : '  FAIL ') + item.name + (item.detail ? ' | ' + item.detail : ''));
            if (!item.pass) failed.push(r.case.name + ': ' + item.name);
        }
    }
    console.log('--- interaction ---');
    for (const item of interaction) {
        console.log((item.pass ? '  PASS ' : '  FAIL ') + item.name + (item.detail ? ' | ' + item.detail : ''));
        if (!item.pass) failed.push('interaction: ' + item.name);
    }
    fs.writeFileSync(path.join(OUT, 'report.json'),
        JSON.stringify({ cases: report, interaction: interaction }, null, 2));
    const total = report.reduce((n, r) => n + r.results.length, 0) + interaction.length;
    console.log('checks=' + total + ' failed=' + failed.length);
    if (failed.length) { console.log(failed.join('\n')); process.exitCode = 1; }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
