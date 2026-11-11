'use strict';
// 小窝页 HUD 上移的浏览器几何验收（依赖 build-miniprogram-nest-hud-preview.cjs 的截图与量测）。
// 断言全部基于真实 WXSS + 真实 nest-layout.js 算法渲染出的元素矩形，不是手填坐标。
// 运行：node scripts/verify-miniprogram-nest-hud-lift.cjs
//      （默认重新生成证据；设 XCWC_HUD_REUSE=1 可复用已有 report.json）
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'nest-hud-lift');
const REPORT = path.join(OUT, 'report.json');
const BUILD = path.join(__dirname, 'build-miniprogram-nest-hud-preview.cjs');

if (process.env.XCWC_HUD_REUSE !== '1' || !fs.existsSync(REPORT)) {
    const run = spawnSync(process.execPath, [BUILD], { cwd: ROOT, stdio: 'inherit' });
    if (run.status !== 0) { console.error('生成视觉证据失败'); process.exit(1); }
}
const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
const V = report.variants;
const facts = [];
const problems = [];
function ok(label, cond, detail) {
    if (cond) facts.push('PASS ' + label + (detail ? ' — ' + detail : ''));
    else problems.push('FAIL ' + label + (detail ? ' — ' + detail : ''));
}
function rectOverlap(a, b) {
    return !!a && !!b && a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
}
function insideRatio(box, guide) {
    if (!box || !guide) return 0;
    const w = Math.max(0, Math.min(box.right, guide.right) - Math.max(box.x, guide.x));
    const h = Math.max(0, Math.min(box.bottom, guide.bottom) - Math.max(box.y, guide.y));
    return (w * h) / (box.w * box.h);
}

const widths = ['375', '320', '390', '430'];
for (const w of widths) {
    const before = V[w + '-before'];
    const after = V[w + '-after'];
    ok(w + 'px：前后两组证据齐全', !!before && !!after);
    if (!before || !after) continue;
    const b = before.metrics, a = after.metrics, d = after.device;
    const tag = w + 'px';

    // 1. 两张卡片整体上移，钱包明显向中间靠拢（用户诉求）
    const liftA = b.identity.y - a.identity.y;
    const liftB = b.wallet.y - a.wallet.y;
    const shiftLeft = b.wallet.x - a.wallet.x;
    ok(tag + ' 身份卡与钱包整体上移', liftA >= 30 && liftB >= 30,
        'identity +' + liftA.toFixed(1) + 'px / wallet +' + liftB.toFixed(1) + 'px');
    ok(tag + ' 叽分钱包明显靠近中间', shiftLeft >= 60, '左移 ' + shiftLeft.toFixed(1) + 'px');

    // 2. 不压状态栏、不压系统胶囊、两卡互不重叠
    ok(tag + ' HUD 不侵入状态栏', a.identity.y >= d.statusBar + 8,
        'HUD 顶 ' + a.identity.y + ' / 状态栏 ' + d.statusBar);
    ok(tag + ' 叽分钱包不与胶囊矩形重叠', !rectOverlap(a.wallet, a.capsule));
    const gap = a.capsule.x - a.wallet.right;
    ok(tag + ' 叽分与胶囊留出呼吸间隙', gap >= 12, gap.toFixed(1) + 'px');
    ok(tag + ' 身份卡不与钱包重叠', !rectOverlap(a.identity, a.wallet),
        '两卡间距 ' + (a.wallet.x - a.identity.right).toFixed(1) + 'px');

    // 3. 下方状态条紧跟 HUD，间距与旧版完全一致（整体协调，不脱节）
    const gapA = a.status.y - a.identity.bottom;
    const gapB = b.status.y - b.identity.bottom;
    ok(tag + ' 状态条与 HUD 间距保持原值', Math.abs(gapA - gapB) < 0.6,
        gapA.toFixed(1) + 'px（旧 ' + gapB.toFixed(1) + 'px）');

    // 4. 场景主体不随 HUD 移动（背景与小鸟布局零回归）
    ok(tag + ' 对话气泡与小鸟立绘位置不变',
        Math.abs(a.speech.y - b.speech.y) < 0.6 && Math.abs(a.actor.y - b.actor.y) < 0.6);

    // 5. 常规昵称完整显示
    ok(tag + ' 常规昵称未被截断', a.nameClipped === false,
        'scrollW=' + a.nameScrollWidth + ' clientW=' + a.nameClientWidth);
}

// 6. 用户标注的两个黄框：两张卡片确实落进去了
const g = V['375-after-guides'];
if (g) {
    const m = g.metrics;
    const rl = insideRatio(m.identity, m.yellowLeft);
    const rr = insideRatio(m.wallet, m.yellowRight);
    ok('375px 身份卡落入左侧黄框', rl >= 0.8, '覆盖率 ' + (rl * 100).toFixed(1) + '%');
    ok('375px 叽分钱包落入右侧黄框', rr >= 0.8, '覆盖率 ' + (rr * 100).toFixed(1) + '%');
} else {
    ok('375px 黄框证据存在', false);
}

// 7. 长昵称兜底：允许 ellipsis，但不能把钱包挤出或造成重叠
const ln = V['375-after-longname'];
if (ln) {
    const m = ln.metrics;
    ok('长昵称仍由 ellipsis 兜底', m.nameClipped === true);
    ok('长昵称不撑破 HUD', !rectOverlap(m.identity, m.wallet) && !rectOverlap(m.wallet, m.capsule),
        '两卡间距 ' + (m.wallet.x - m.identity.right).toFixed(1) + 'px');
} else {
    ok('长昵称证据存在', false);
}

console.log('\n小窝页 HUD 上移 · 浏览器几何验收：');
facts.forEach(f => console.log('  ' + f));
console.log('问题 (' + problems.length + ')');
problems.forEach(p => console.log('  ' + p));
if (problems.length) { console.log('\n❌ 未达交付标准'); process.exit(1); }
console.log('\n✅ 全部通过（' + facts.length + ' 项）');
console.log('证据目录：' + path.relative(ROOT, OUT));
