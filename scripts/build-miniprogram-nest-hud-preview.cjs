'use strict';
// 小窝页顶部 HUD 上移验收：把「当前真实 WXSS + nest-layout.js 真实算法」渲染成手机视图，
// 叠加状态栏、系统胶囊与用户标注的两个黄框，产出 before/after/长昵称/多机型截图与坐标量测。
// 仅用于视觉与几何复核，不参与小程序构建、不修改任何源码。
// 运行：node scripts/build-miniprogram-nest-hud-preview.cjs
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'nest-hud-lift');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ASSET = 'file://' + path.join(ROOT, 'miniprogram', 'assets', 'nest');
const WXSS = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/index/index.wxss'), 'utf8');
const LAYOUT = path.join(ROOT, 'miniprogram/utils/nest-layout.js');
fs.mkdirSync(OUT, { recursive: true });

// 从真实 WXSS 里挑出顶部叠层相关规则，避免把弹层/toast 规则带进来干扰布局。
const TOP_NAMES = ['ui-hover', 'hud', 'identity', 'avatar', 'identity-text', 'name', 'name-text', 'pen', 'place',
    'companion', 'hud-clip', 'icon-companion', 'companion-text', 'switch', 'wallet', 'feather-clip',
    'icon-feather', 'wallet-num', 'points', 'unit', 'wallet-plus', 'status', 'stat', 'stat-line',
    'stat-icon-clip', 'icon-food', 'icon-water', 'icon-mood', 'stat-label', 'stat-value', 'stat-track',
    'stat-fill', 'needs', 'need', 'tools', 'tool', 'tool-prop-clip', 'prop-clean', 'prop-supply',
    'prop-checkin', 'prop-dress', 'tool-label', 'tool-dot', 'speech', 'speech-text', 'actor',
    'bird-hit', 'bird-art', 'shadow', 'grass', 'blade'];
function pickTopCss(css) {
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
        const sel = m[1].trim().replace(/\/\*[\s\S]*?\*\//g, '').trim();
        if (TOP_NAMES.some(n => new RegExp('\\.' + n + '(?![\\w-])').test(sel))) out.push(sel + ' {' + m[2] + '}');
    }
    return out.join('\n');
}
const TOP_CSS = pickTopCss(WXSS);

function rpx2px(css, width) {
    const k = width / 750;
    return css.replace(/(-?\d+(?:\.\d+)?)rpx/g, (_, n) => (Number(n) * k).toFixed(3).replace(/\.?0+$/, '') + 'px');
}

// 用真实算法算布局；桩环境的胶囊矩形与用户截图机型一致。
function readLayout(device, withMenu) {
    delete require.cache[require.resolve(LAYOUT)];
    const prev = global.wx;
    global.wx = {
        getWindowInfo: () => ({
            windowWidth: device.width, windowHeight: device.height,
            statusBarHeight: device.statusBar, screenHeight: device.height,
            safeArea: { bottom: device.height - device.bottomInset },
        }),
    };
    if (withMenu) {
        global.wx.getMenuButtonBoundingClientRect = () => ({
            top: device.menu.top, height: device.menu.height, left: device.menu.left,
            width: device.width - device.menu.left - 12, right: device.width - 12,
            bottom: device.menu.top + device.menu.height,
        });
    }
    let result;
    try { result = require(LAYOUT).readNestLayout(); }
    finally { global.wx = prev; }
    return result;
}

// 用户截图标注的黄框（在 375px 视口下换算），其它机型等比缩放。
function guidesFor(width) {
    const k = width / 375;
    const box = (x1, y1, x2, y2) => ({ x: x1 * k, y: y1 * k, w: (x2 - x1) * k, h: (y2 - y1) * k });
    return { left: box(2.6, 55.6, 170.8, 120.9), right: box(187.8, 59.2, 285.0, 106.5) };
}

function html(o) {
    const { device, L, mode, name, showGuides } = o;
    const { width, height, statusBar, menu } = device;
    const k = width / 750;
    const px = v => (v * k).toFixed(2);
    const css = rpx2px(TOP_CSS, width);
    const g = guidesFor(width);
    const hudRight = mode === 'before' ? 12 : L.hudRight;
    const layout = mode === 'before'
        ? { hudTop: L.inset + 8, statusTop: L.inset + 128, needsTop: L.inset + 230, toolsTop: L.inset + 270 }
        : L;
    const guideHtml = showGuides ? `
    <div id="guide-left" class="guide" style="left:${g.left.x}px;top:${g.left.y}px;width:${g.left.w}px;height:${g.left.h}px"></div>
    <div id="guide-right" class="guide" style="left:${g.right.x}px;top:${g.right.y}px;width:${g.right.w}px;height:${g.right.h}px"></div>` : '';
    const capsuleW = width - menu.left - 12;
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${o.title}</title>
<style>
html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:#B7D68F}
*{box-sizing:border-box}img{display:block}
.page-scene{position:fixed;top:0;left:0;width:${width}px;height:${height}px;z-index:0;pointer-events:none}
.nest{position:relative;z-index:1;width:${width}px;height:${px(L.pageHeight)}px;overflow:hidden;background:transparent;color:#795336;
 font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
.scene-shade{position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;
 background:linear-gradient(to bottom,rgba(255,249,223,.04),rgba(255,255,255,0) 30%,rgba(255,255,255,0) 85%,rgba(228,232,170,.08))}
.sprite{position:absolute;display:block;top:0;left:0}.clip{position:relative;overflow:hidden;flex:none}
.tex-bg{position:absolute;top:0;left:0;width:100%;height:100%;z-index:0}
.label{position:fixed;bottom:0;left:0;z-index:80;background:#2f3b28cc;color:#fff;font:600 10px/1.5 monospace;padding:2px 6px}
.statusbar{position:fixed;top:0;left:0;width:${width}px;height:${statusBar}px;z-index:70;pointer-events:none;
 display:flex;align-items:center;justify-content:space-between;padding:0 18px;color:#1d2b18;font:600 14px/1 -apple-system,sans-serif}
.notch{position:fixed;top:${Math.max(6, statusBar * 0.18)}px;left:50%;transform:translateX(-50%);width:92px;height:26px;
 border-radius:99px;background:#0b0b0b;z-index:71;pointer-events:none}
.battery{display:inline-block;width:22px;height:11px;border:1.5px solid #1d2b18;border-radius:3px;position:relative;margin-left:5px;vertical-align:-1px}
.battery:after{content:"";position:absolute;left:1.5px;top:1.5px;bottom:1.5px;right:5px;background:#1d2b18;border-radius:1px}
.menu-capsule{position:fixed;left:${menu.left}px;top:${menu.top}px;width:${capsuleW}px;height:${menu.height}px;
 border-radius:99px;background:rgba(255,255,255,.94);box-shadow:0 1px 5px #0002;z-index:70;pointer-events:none;
 display:flex;align-items:center;justify-content:space-evenly;color:#22301c;font:600 15px/1 -apple-system,sans-serif}
.menu-dot{width:19px;height:19px;border:2.5px solid #22301c;border-radius:50%;position:relative}
.menu-dot:after{content:"";position:absolute;left:5px;top:5px;width:5px;height:5px;border-radius:50%;background:#22301c}
.guide{position:fixed;border:2px solid #FFC400;z-index:60;pointer-events:none}
${css}
</style></head><body>
<img class="page-scene" src="${ASSET}/background.webp" style="object-fit:fill">
<div class="nest">
  <div class="scene-shade"></div>
  <div class="hud" style="top:${px(layout.hudTop)}px;right:${px(hudRight)}px">
    <div class="identity">
      <img class="tex-bg" src="${ASSET}/pill.webp">
      <div class="avatar"><img src="${ASSET}/avatar.webp" style="width:100%;height:100%;object-fit:cover"></div>
      <div class="identity-text">
        <div class="name"><span class="name-text">${name}</span><span class="pen">✎</span></div>
        <span class="place">⌖ 江南小窝</span>
      </div>
      <div class="companion"><div class="clip hud-clip"><img class="sprite icon-companion" src="${ASSET}/hud-icons.webp"></div><span class="companion-text">相伴</span></div>
      <span class="switch">›</span>
    </div>
    <div class="wallet">
      <img class="tex-bg" src="${ASSET}/pill.webp">
      <div class="clip feather-clip"><img class="sprite icon-feather" src="${ASSET}/hud-icons.webp"></div>
      <div class="wallet-num"><span class="points">3</span><span class="unit">叽分</span></div>
      <span class="wallet-plus">＋</span>
    </div>
  </div>
  <div class="status" style="top:${px(layout.statusTop)}px">
    <div class="stat"><img class="tex-bg" src="${ASSET}/pill.webp"><div class="stat-line"><div class="clip stat-icon-clip"><img class="sprite icon-food" src="${ASSET}/hud-icons.webp"></div><span class="stat-label">饱食</span><span class="stat-value">0%</span></div><div class="stat-track"><div class="stat-fill" style="width:0%"></div></div></div>
    <div class="stat"><img class="tex-bg" src="${ASSET}/pill.webp"><div class="stat-line"><div class="clip stat-icon-clip"><img class="sprite icon-water" src="${ASSET}/hud-icons.webp"></div><span class="stat-label">水分</span><span class="stat-value">24%</span></div><div class="stat-track"><div class="stat-fill" style="width:24%"></div></div></div>
    <div class="stat"><img class="tex-bg" src="${ASSET}/pill.webp"><div class="stat-line"><div class="clip stat-icon-clip"><img class="sprite icon-mood" src="${ASSET}/hud-icons.webp"></div><span class="stat-label">心情</span><span class="stat-value">4%</span></div><div class="stat-track"><div class="stat-fill" style="width:4%"></div></div></div>
  </div>
  <div class="needs" style="top:${px(layout.needsTop)}px">
    <div class="need">肚子饿了</div><div class="need">想喝水</div><div class="need is-current">想你陪陪</div>
  </div>
  <div class="tools" style="top:${px(layout.toolsTop)}px">
    <div class="tool"><img class="tex-bg" src="${ASSET}/cloud.webp"><div class="clip tool-prop-clip"><img class="sprite prop-clean" src="${ASSET}/tools.webp"></div><span class="tool-label">清洁</span></div>
    <div class="tool"><img class="tex-bg" src="${ASSET}/cloud.webp"><div class="clip tool-prop-clip"><img class="sprite prop-supply" src="${ASSET}/tools.webp"></div><span class="tool-label">补给</span><div class="tool-dot"></div></div>
    <div class="tool"><img class="tex-bg" src="${ASSET}/cloud.webp"><div class="clip tool-prop-clip"><img class="sprite prop-checkin" src="${ASSET}/tools.webp"></div><span class="tool-label">合照打卡</span></div>
    <div class="tool"><img class="tex-bg" src="${ASSET}/cloud.webp"><div class="clip tool-prop-clip"><img class="sprite prop-dress" src="${ASSET}/tools.webp"></div><span class="tool-label">换装</span></div>
  </div>
  <div class="speech" style="top:${px(L.speechTop)}px"><img class="tex-bg" src="${ASSET}/bubble.webp"><span class="speech-text">阳光正好，陪我待一会儿吧～</span></div>
  <div class="actor has-bird" style="top:${px(L.actorTop)}px;height:${px(L.actorHeight)}px">
    <div class="shadow"></div><div class="bird-hit"><img class="bird-art" src="${ASSET}/poster.webp" style="width:100%;height:100%;object-fit:contain"></div>
  </div>
</div>
<div class="statusbar"><span>13:59</span><span>4G <i class="battery"></i></span></div>
<div class="notch"></div>
<div class="menu-capsule"><span>···</span><span class="menu-dot"></span></div>
<div class="label">${o.title}</div>
${guideHtml}
<pre id="metrics" style="display:none"></pre>
<script>
(function(){
  function R(s){var e=document.querySelector(s);if(!e)return null;var r=e.getBoundingClientRect();
    return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),right:+r.right.toFixed(1),bottom:+r.bottom.toFixed(1)};}
  var nameEl=document.querySelector('.name-text');
  var m={hud:R('.hud'),identity:R('.identity'),wallet:R('.wallet'),status:R('.status'),
    needs:R('.needs'),tools:R('.tools'),speech:R('.speech'),actor:R('.actor'),
    capsule:R('.menu-capsule'),yellowLeft:R('#guide-left'),yellowRight:R('#guide-right'),
    nameClipped:nameEl?(nameEl.scrollWidth>nameEl.clientWidth+1):null,
    nameScrollWidth:nameEl?nameEl.scrollWidth:null,nameClientWidth:nameEl?nameEl.clientWidth:null};
  document.getElementById('metrics').textContent=JSON.stringify(m);
})();
</script>
</body></html>`;
}

function chrome(args) {
    return execFileSync(CHROME, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
        '--allow-file-access-from-files', '--force-device-scale-factor=1',
        '--no-first-run', '--no-default-browser-check', '--virtual-time-budget=3500',
    ].concat(args), { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

const DEVICES = [
    { id: '375', width: 375, height: 812, statusBar: 44, bottomInset: 34, menu: { top: 67, height: 36, left: 289 }, main: true },
    { id: '320', width: 320, height: 568, statusBar: 20, bottomInset: 0, menu: { top: 26, height: 32, left: 246 } },
    { id: '390', width: 390, height: 844, statusBar: 47, bottomInset: 34, menu: { top: 70, height: 36, left: 302 } },
    { id: '430', width: 430, height: 932, statusBar: 54, bottomInset: 34, menu: { top: 74, height: 36, left: 340 } },
];

const variants = [];
for (const d of DEVICES) {
    const L = readLayout(d, true);
    variants.push({ id: d.id + '-before', device: d, L, mode: 'before', name: '西湖小黄莺', showGuides: false, title: d.id + ' · BEFORE（旧）' });
    variants.push({ id: d.id + '-after', device: d, L, mode: 'after', name: '西湖小黄莺', showGuides: false, title: d.id + ' · AFTER（新）' });
    if (d.main) {
        variants.push({ id: '375-after-guides', device: d, L, mode: 'after', name: '西湖小黄莺', showGuides: true, title: '375 · AFTER + 用户黄框' });
        variants.push({ id: '375-after-longname', device: d, L, mode: 'after', name: '西湖小黄莺呀真好听', showGuides: false, title: '375 · AFTER · 长昵称' });
        variants.push({ id: '375-before-guides', device: d, L, mode: 'before', name: '西湖小黄莺', showGuides: true, title: '375 · BEFORE + 用户黄框' });
    }
}

const report = { generatedAt: new Date().toISOString(), variants: {} };
for (const v of variants) {
    const file = path.join(OUT, v.id + '.html');
    const png = path.join(OUT, v.id + '.png');
    fs.writeFileSync(file, html(v), 'utf8');
    chrome(['--window-size=' + v.device.width + ',' + v.device.height, '--screenshot=' + png, 'file://' + file]);
    const dom = chrome(['--window-size=' + v.device.width + ',' + v.device.height, '--dump-dom', 'file://' + file]);
    const m = dom.match(/<pre id="metrics"[^>]*>([\s\S]*?)<\/pre>/);
    if (!m) throw new Error('未取到量测数据: ' + v.id);
    const applied = v.mode === 'before'
        ? { hudTop: v.L.inset + 8, hudRight: 12, statusTop: v.L.inset + 128, needsTop: v.L.inset + 230, toolsTop: v.L.inset + 270 }
        : { hudTop: v.L.hudTop, hudRight: v.L.hudRight, statusTop: v.L.statusTop, needsTop: v.L.needsTop, toolsTop: v.L.toolsTop };
    report.variants[v.id] = {
        device: { width: v.device.width, height: v.device.height, statusBar: v.device.statusBar, menu: v.device.menu },
        layout: Object.assign({ inset: v.L.inset, speechTop: v.L.speechTop, actorTop: v.L.actorTop }, applied),
        mode: v.mode,
        metrics: JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')),
        png: path.relative(ROOT, png),
    };
    console.log('  ✓ ' + v.id);
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

// 并排对比页：BEFORE / AFTER / AFTER+黄框
const imgs = ['375-before', '375-after', '375-after-guides', '375-before-guides', '375-after-longname'];
fs.writeFileSync(path.join(OUT, 'compare.html'),
    '<!doctype html><meta charset="utf-8"><title>HUD 上移对比</title>' +
    '<style>body{margin:0;padding:16px;background:#eef0e4;font:14px/1.6 -apple-system,sans-serif;display:flex;flex-wrap:wrap;gap:16px}' +
    'figure{margin:0}figcaption{font-weight:600;margin-bottom:6px}img{width:375px;border:1px solid #c8cdb8;border-radius:8px;display:block}</style>' +
    imgs.map(id => '<figure><figcaption>' + id + '</figcaption><img src="' + id + '.png"></figure>').join(''), 'utf8');
console.log('\n已生成 ' + Object.keys(report.variants).length + ' 组截图与量测：' + path.relative(ROOT, OUT));
