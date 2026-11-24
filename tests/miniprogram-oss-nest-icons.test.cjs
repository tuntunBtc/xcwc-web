'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

test('OSS candidate maps dynamic nest icons and includes no packaged images', t => {
    const root = path.resolve(__dirname, '..');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'xcwh-oss-nest-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const media = path.join(temp, 'media');
    const candidate = path.join(temp, 'candidate');
    execFileSync(process.execPath, ['scripts/prepare-miniprogram-oss-media.cjs', media], { cwd: root });
    execFileSync(process.execPath, ['scripts/prepare-miniprogram-candidate.cjs', '--output', candidate,
        '--appid', 'wx1234567890abcdef', '--api-base', 'https://api.example.com/bird/v1'], {
        cwd: root, env: { ...process.env, XCWH_MINI_MEDIA_MANIFEST: path.join(media, 'manifest.json') },
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(media, 'manifest.json'), 'utf8'));
    const context = { module: { exports: {} } };
    vm.runInNewContext(fs.readFileSync(path.join(candidate, 'utils/nest-oss-icons.wxs'), 'utf8'), context);
    for (const key of ['hunger', 'water', 'mood', 'clean', 'supply', 'checkin', 'ar', 'video']) {
        assert.equal(context.module.exports.url(key), manifest[`/assets/nest/line-icons/${key}.png`].url);
    }
    assert.equal(context.module.exports.url('unknown'), '');
    const view = fs.readFileSync(path.join(candidate, 'pages/index/index.wxml'), 'utf8');
    assert.equal((view.match(/nestOssIcons\.url\(item\.key\)/g) || []).length, 2);
    assert.doesNotMatch(view, /line-icons\/\{\{item\.key\}\}/);
    const releaseManifest = require(path.join(candidate, 'utils/release-images-manifest.js'));
    const controller = fs.readFileSync(path.join(candidate, 'pages/index/index.js'), 'utf8');
    for (const name of ['background-preview-room.webp', 'background-preview-osmanthus.webp']) {
        const route = `/assets/nest/${name}`;
        assert.equal(releaseManifest.files[route].url, manifest[route].url);
        assert.equal(releaseManifest.files[route].sha256, manifest[route].sha256);
        assert.ok(view.includes(route), `背景切换未引用 ${route}`);
        assert.ok(controller.includes(route), `背景未加入预加载 ${route}`);
    }
    const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const name = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(name) : [name];
    });
    assert.deepEqual(walk(candidate).filter(name => /\.(?:png|jpe?g|webp|gif|svg|bin)$/i.test(name)), []);
});
