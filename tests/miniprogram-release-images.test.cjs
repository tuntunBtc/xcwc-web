'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const runtime = fs.readFileSync(path.join(__dirname, '../scripts/miniprogram-release-images-runtime.js'), 'utf8');

test('release image cache reclaims obsolete generated directories and preserves the prior release', async () => {
    const base = 'wxfile://usr/xcwc-release-images';
    const version = '1'.repeat(20);
    const recent = '2'.repeat(20);
    const old = '3'.repeat(20);
    const busy = '4'.repeat(20);
    const unrelatedFile = '5'.repeat(20);
    const fixture = 'fixture-' + '6'.repeat(20);
    const warm = '7'.repeat(20);
    const now = 1794330000000;
    const asset = Uint8Array.from(Buffer.from('RIFF\x08\0\0\0WEBPtest', 'latin1'));
    const target = `${base}/${version}/hero.webp`;
    const statPaths = [];
    const deletions = [];
    let lists = 0;
    const files = {
        mkdir({ success }) { success(); },
        readdir({ dirPath, success }) {
            assert.equal(dirPath, base);
            lists += 1;
            success({ files: [old, recent, fixture, busy, unrelatedFile, version, warm, 'photos', '../outside'] });
        },
        stat({ path, success }) {
            statPaths.push(path);
            if (path === target) return success({ stats: { isFile: () => true, size: asset.length } });
            const name = path.split('/').pop();
            const modified = { [recent]: now / 1000 - 1, [old]: 2, [busy]: 1, [unrelatedFile]: 20, [warm]: now - 3600000 };
            success({ stats: { isDirectory: () => name !== unrelatedFile, lastModifiedTime: modified[name] } });
        },
        rmdir({ dirPath, recursive, success, fail }) {
            assert.equal(recursive, true);
            deletions.push(dirPath);
            if (dirPath.endsWith(busy)) fail();
            else success();
        },
        readFile({ filePath, length, success }) {
            assert.equal(filePath, target);
            success({ data: asset.slice(0, length).buffer });
        },
    };
    const sandbox = {
        module: { exports: {} },
        require: () => ({ version, files: { '/hero.webp': { name: 'hero.webp', source: 'assets/hero.bin', size: asset.length } } }),
        wx: { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => files },
        Date: { now: () => now },
    };
    vm.runInNewContext(runtime, sandbox);
    const { prepare } = sandbox.module.exports;
    assert.deepEqual(await Promise.all([prepare(['/hero.webp']), prepare(['/hero.webp'])]),
        [`${base}/${version}`, `${base}/${version}`]);
    assert.equal(lists, 1);
    assert.deepEqual(deletions, [`${base}/${old}`, `${base}/${busy}`]);
    assert.deepEqual(statPaths.filter(path => path !== target).sort(),
        [old, recent, busy, unrelatedFile, warm].map(name => `${base}/${name}`).sort());
});

test('strict release check matches both step supply states', t => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xcwc-release-supply-'));
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
    const generator = path.join(__dirname, '../scripts/prepare-miniprogram-candidate.cjs');
    const verifier = path.join(__dirname, '../scripts/verify-miniprogram-release.cjs');
    const appid = 'wx1234567890abcdef';
    const origin = 'https://api.birdpartners.cn';
    for (const enabled of [false, true]) {
        const output = path.join(temporary, enabled ? 'enabled' : 'disabled');
        const flags = enabled ? ['--step-supply'] : [];
        execFileSync(process.execPath, [generator, '--output', output, '--appid', appid,
            '--api-base', origin, ...flags], { encoding: 'utf8' });
        for (const page of ['shop', 'photo']) {
            const template = fs.readFileSync(path.join(output, 'pages', page, `${page}.wxml`), 'utf8');
            assert.match(template, /^(?:\s|<!--[\s\S]*?-->)*<page-meta\b[^]*?<\/page-meta>\s*<wxs\b/);
        }
        assert.equal(spawnSync(process.execPath, [verifier, output], { encoding: 'utf8' }).status, 0);
        const result = spawnSync(process.execPath, [verifier, output, '--step-supply'], { encoding: 'utf8' });
        assert.equal(result.status, enabled ? 0 : 1);
        if (!enabled) assert.match(result.stderr, /候选包尚未开启微信步数补给/);
        const strict = ['--release', '--appid', appid, '--api-base', origin];
        const strictEnabled = spawnSync(process.execPath, [verifier, output, ...strict, '--step-supply'], { encoding: 'utf8' });
        assert.equal(strictEnabled.status, enabled ? 0 : 1, strictEnabled.stdout + strictEnabled.stderr);
        const strictDisabled = spawnSync(process.execPath, [verifier, output, ...strict], { encoding: 'utf8' });
        assert.equal(strictDisabled.status, enabled ? 1 : 0, strictDisabled.stdout + strictDisabled.stderr);
        if (enabled) assert.match(strictDisabled.stderr, /正式校验预期关闭微信步数补给/);
    }
});

test('strict release check requires the approved AppID and public API origin', t => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xcwc-release-identity-'));
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
    const output = path.join(temporary, 'candidate');
    const generator = path.join(__dirname, '../scripts/prepare-miniprogram-candidate.cjs');
    const verifier = path.join(__dirname, '../scripts/verify-miniprogram-release.cjs');
    const appid = 'wx1234567890abcdef';
    const origin = 'https://api.birdpartners.cn';
    execFileSync(process.execPath, [generator, '--output', output, '--appid', appid, '--api-base', origin, '--step-supply'],
        { encoding: 'utf8' });

    const run = (...flags) => spawnSync(process.execPath, [verifier, output, ...flags], { encoding: 'utf8' });
    const strict = (expectedId, expectedApi) => run('--release', '--step-supply', '--appid', expectedId, '--api-base', expectedApi);
    const reject = (result, reason) => {
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, reason);
    };

    assert.equal(strict(appid, origin + '/').status, 0);
    reject(run('--release', '--api-base', origin), /正式校验需要.*--appid/);
    reject(run('--release', '--appid', appid), /正式校验需要.*--api-base/);
    reject(run('--appid', appid, '--api-base', origin), /需要与 --release 一起使用/);
    reject(strict('wxfedcba0987654321', origin), /AppID.*不一致/);
    reject(strict(appid, origin + ':8443'), /API 根地址.*不一致/);
    reject(strict(appid, origin + '/api'), /正式校验需要.*--api-base/);

    const configFile = path.join(output, 'utils/config.js');
    const config = require(configFile);
    for (const placeholder of ['https://api.example.invalid', 'https://qa.example.com', 'https://api.birdpartners.test.']) {
        fs.writeFileSync(configFile, 'module.exports = ' + JSON.stringify({ ...config, API_BASE: placeholder }), 'utf8');
        assert.equal(run('--step-supply').status, 0);
        reject(strict(appid, placeholder), /保留域名/);
    }
    for (const nonPublic of ['https://127.0.0.1', 'https://api.local.', 'https://api.example.invalid..']) {
        fs.writeFileSync(configFile, 'module.exports = ' + JSON.stringify({ ...config, API_BASE: nonPublic }), 'utf8');
        reject(run('--step-supply'), /缺少有效的 HTTPS API 域名根地址/);
    }
});

test('release check protects required files from packaging exclusions', t => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xcwc-release-pack-options-'));
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
    const output = path.join(temporary, 'candidate');
    const generator = path.join(__dirname, '../scripts/prepare-miniprogram-candidate.cjs');
    const verifier = path.join(__dirname, '../scripts/verify-miniprogram-release.cjs');
    const appid = 'wx1234567890abcdef';
    const origin = 'https://api.birdpartners.cn';
    execFileSync(process.execPath, [generator, '--output', output, '--appid', appid, '--api-base', origin], { encoding: 'utf8' });

    const configFile = path.join(output, 'project.config.json');
    const project = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const unused = { type: 'file', value: 'assets/unused-preview.webp' };
    fs.writeFileSync(path.join(output, unused.value), 'unused preview', 'utf8');
    const run = (ignore, include = [], strict = true) => {
        fs.writeFileSync(configFile, JSON.stringify({ ...project, packOptions: { ignore: [unused, ...ignore], include } }), 'utf8');
        const flags = strict ? ['--release', '--appid', appid, '--api-base', origin] : [];
        return spawnSync(process.execPath, [verifier, output, ...flags], { encoding: 'utf8' });
    };

    assert.equal(run([]).status, 0);
    const blocked = run([
        { type: 'file', value: '/app.js' },
        { type: 'file', value: 'sitemap.json' },
        { type: 'folder', value: 'pages/photo/' },
        { type: 'folder', value: '/custom-tab-bar/' },
    ]);
    assert.equal(blocked.status, 1, blocked.stdout + blocked.stderr);
    for (const file of ['app.js', 'sitemap.json', 'pages/photo/photo.js', 'pages/photo/photo.wxml',
        'pages/photo/photo.wxss', 'custom-tab-bar/index.js', 'custom-tab-bar/index.json', 'custom-tab-bar/index.wxml']) {
        assert.ok(blocked.stderr.includes('打包规则排除了必需文件：' + file), blocked.stderr);
    }

    const controller = { type: 'file', value: 'pages/photo/photo.js' };
    assert.equal(run([controller], [controller]).status, 0);

    const unusedModule = { type: 'file', value: 'utils/unused-preview.js' };
    fs.writeFileSync(path.join(output, unusedModule.value), 'module.exports = {};', 'utf8');
    assert.equal(run([unusedModule]).status, 0);
    const bridge = { type: 'file', value: 'utils/step-supply.js' };
    const ignoredBridge = run([bridge]);
    assert.equal(ignoredBridge.status, 1, ignoredBridge.stdout + ignoredBridge.stderr);
    assert.match(ignoredBridge.stderr, /打包规则排除了必需文件：utils\/step-supply\.js/);
    assert.equal(run([bridge], [bridge]).status, 0);

    const runtimeDependencies = ['media/collection/files.js', 'media/nest-idle/files.js', 'utils/release-images.wxs'];
    for (const value of runtimeDependencies) {
        const module = { type: 'file', value };
        const ignored = run([module]);
        assert.equal(ignored.status, 1, ignored.stdout + ignored.stderr);
        assert.ok(ignored.stderr.includes('打包规则排除了必需文件：' + value), ignored.stderr);
        assert.equal(run([module], [module]).status, 0);
    }

    const manifest = { type: 'file', value: 'utils/release-images-manifest.js' };
    const ignoredManifest = run([manifest]);
    assert.equal(ignoredManifest.status, 1, ignoredManifest.stdout + ignoredManifest.stderr);
    assert.match(ignoredManifest.stderr, /打包规则排除了必需文件：utils\/release-images-manifest\.js/);

    const excludedRoot = run([{ type: 'folder', value: '/' }]);
    assert.equal(excludedRoot.status, 1, excludedRoot.stdout + excludedRoot.stderr);
    assert.match(excludedRoot.stderr, /打包规则排除了必需文件：app\.js/);
    const broad = { type: 'glob', value: '**/*.js' };
    const unsupported = run([broad]);
    assert.equal(unsupported.status, 1, unsupported.stdout + unsupported.stderr);
    assert.match(unsupported.stderr, /正式校验不支持.*glob/);
    assert.equal(run([broad], [], false).status, 0);

    for (const file of runtimeDependencies) fs.unlinkSync(path.join(output, file));
    const missingRuntime = run([]);
    assert.equal(missingRuntime.status, 1, missingRuntime.stdout + missingRuntime.stderr);
    for (const file of runtimeDependencies) {
        assert.ok(missingRuntime.stderr.includes('候选包缺少必需文件：' + file), missingRuntime.stderr);
    }

    fs.unlinkSync(path.join(output, manifest.value));
    const missingManifest = run([]);
    assert.equal(missingManifest.status, 1, missingManifest.stdout + missingManifest.stderr);
    assert.match(missingManifest.stderr, /候选包缺少必需文件：utils\/release-images-manifest\.js/);
});

test('generated adoption artwork waits for mountable sources and tracks native image events', t => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xcwc-release-adopt-'));
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
    const output = path.join(temporary, 'candidate');
    const generator = path.join(__dirname, '../scripts/prepare-miniprogram-candidate.cjs');
    execFileSync(process.execPath, [generator, '--output', output, '--fixture'], { encoding: 'utf8' });

    const view = fs.readFileSync(path.join(output, 'pages/adopt/adopt.wxml'), 'utf8');
    const images = view.match(/<image\b[^>]*>/g) || [];
    const slots = {
        'scene-art': '/pages/adopt/assets/scene.webp',
        'details-top': '/pages/adopt/assets/lower-top.webp',
        'details-bottom': '/pages/adopt/assets/lower-bottom.webp',
        'adopt-button-art': '/pages/adopt/assets/button.webp',
    };
    const wxs = { module: { exports: {} } };
    vm.runInNewContext(fs.readFileSync(path.join(output, 'utils/release-images.wxs'), 'utf8'), wxs);
    const { resolve } = wxs.module.exports;
    const manifest = require(path.join(output, 'utils/release-images-manifest.js'));
    const root = 'wxfile://usr/xcwc-release-images/test';
    for (const [slot, source] of Object.entries(slots)) {
        const tag = images.find(image => image.includes(`class="${slot}"`));
        assert.ok(tag, `Missing artwork slot ${slot}`);
        assert.match(tag, /wx:if="\{\{releaseLeadReady\}\}"/);
        assert.ok(tag.includes('data-release-epoch="{{releaseArtworkEpoch}}"'));
        assert.ok(tag.includes(`releaseArt.resolve('${source}', releaseImageRoot, releaseImageState, releaseLeadReady)`));
        assert.ok(tag.includes(`data-release-artwork="${slot}"`));
        assert.match(tag, /bindload="onReleaseArtworkLoad"/);
        assert.match(tag, /binderror="onReleaseArtworkError"/);
        assert.equal(resolve(source, root, 'loading', false), '');
        assert.equal(resolve(source, root, 'loading', true), `${root}/${manifest.files[source].name}`);
    }
    const immersive = images.find(image => image.includes('class="immersive-top-art"'));
    assert.match(immersive, /wx:if="\{\{releaseLeadReady\}\}"/);
    assert.match(view, /<button wx:if="\{\{releaseImageState === 'failed' \|\| releaseArtworkState === 'failed'\}\}"[^>]*\bbindtap="retryReleaseImages"/);
    assert.match(view, /<view wx:elif="\{\{releaseArtworkState === 'loading'\}\}"[^>]*\brole="status"/);
    const photo = fs.readFileSync(path.join(output, 'pages/photo/photo.wxml'), 'utf8');
    for (const slot of ['hero-bg', 'page-meadow']) {
        const tag = photo.match(new RegExp(`<image class="${slot}"[^>]*>`))[0];
        assert.ok(tag.includes('wx:if="{{releaseLeadReady}}"'));
        assert.ok(tag.includes('data-release-epoch="{{releaseArtworkEpoch}}"'));
    }

    const registrations = [];
    const releaseImages = {
        page(definition, paths, artwork) {
            registrations.push({ paths: [...paths].sort(), artwork: { ...artwork } });
            return definition;
        },
    };
    const controller = fs.readFileSync(path.join(output, 'pages/adopt/adopt.js'), 'utf8');
    vm.runInNewContext(controller, {
        Page() {},
        require: name => name === '../../utils/release-images' ? releaseImages : {},
    });
    assert.deepEqual(registrations, [{ paths: Object.values(slots).sort(), artwork: slots }]);
});

test('generated shop retains good covers and retries only a failing cover', async t => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xcwc-release-shop-'));
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
    const output = path.join(temporary, 'candidate');
    const generator = path.join(__dirname, '../scripts/prepare-miniprogram-candidate.cjs');
    execFileSync(process.execPath, [generator, '--output', output, '--fixture'], { encoding: 'utf8' });
    const read = file => fs.readFileSync(path.join(output, file), 'utf8');
    const manifest = require(path.join(output, 'utils/release-images-manifest.js'));
    const { PRODUCTS } = require(path.join(output, 'utils/catalog.js'));
    const failed = PRODUCTS[0];
    const failedSource = manifest.files[failed.cover].source;
    const coverSources = PRODUCTS.map(item => manifest.files[item.cover].source);
    const coverReads = [];
    const disk = new Map();
    let remainingFailures = 2;
    const fsManager = {
        readdir({ success }) { success({ files: [] }); },
        mkdir({ success }) { success(); },
        stat({ path, success, fail }) {
            const data = disk.get(path);
            if (data) success({ stats: { size: data.length } });
            else fail();
        },
        readFile({ filePath, position, length, success, fail }) {
            if (coverSources.includes(filePath)) coverReads.push(filePath);
            if (filePath === failedSource && remainingFailures > 0) {
                remainingFailures -= 1;
                fail();
                return;
            }
            const data = filePath.endsWith('.bin')
                ? Uint8Array.from(fs.readFileSync(path.join(output, filePath)))
                : disk.get(filePath).slice(position, position + length);
            success({ data: data.buffer });
        },
        writeFile({ filePath, data, success }) { disk.set(filePath, new Uint8Array(data)); success(); },
        rename({ oldPath, newPath, success }) { disk.set(newPath, disk.get(oldPath)); disk.delete(oldPath); success(); },
        unlink({ filePath, success }) { disk.delete(filePath); success(); },
    };
    const wx = { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => fsManager, getStorageSync: () => [] };
    const originalWx = global.wx;
    global.wx = wx;
    t.after(() => { global.wx = originalWx; });
    const release = { exports: {} };
    vm.runInNewContext(read('utils/release-images.js'), { module: release, require: () => manifest, wx, setTimeout, clearTimeout });
    const collection = { exports: {} };
    const collectionRequire = () => release.exports;
    collectionRequire.async = () => Promise.resolve({});
    vm.runInNewContext(read('utils/collection-media.js'), { module: collection, require: collectionRequire });
    const shopPath = 'pages/shop/shop.js';
    const shopRequire = createRequire(path.join(output, shopPath));
    let definition;
    vm.runInNewContext(read(shopPath), {
        Page(value) { definition = value; },
        require(name) {
            if (name === '../../utils/release-images') return release.exports;
            if (name === '../../utils/collection-media') return collection.exports;
            return shopRequire(name);
        },
    });
    const page = { ...definition, data: structuredClone(definition.data), setData(update) { Object.assign(this.data, update); } };
    t.after(() => page.onUnload());
    page.onLoad();
    page.onShow();
    await page.releaseImagesPending;
    const firstLoad = page.shopCoversPending;
    assert.deepEqual(coverReads, []);
    page.onHide();
    page.onReleaseArtworkLoad({
        currentTarget: { dataset: { releaseArtwork: 'hero-image', releaseEpoch: page.data.releaseArtworkEpoch } },
        detail: { width: 750, height: 341 },
    });
    await Promise.resolve();
    page.onShow();
    assert.equal(page.shopCoversPending, firstLoad);
    await firstLoad;
    assert.deepEqual(coverReads.slice().sort(), coverSources.slice().sort());
    const goodIds = PRODUCTS.slice(1).map(item => item.id).sort();
    assert.deepEqual(Object.keys(page.data.readyCovers).sort(), goodIds);
    assert.equal(page.data.coversFailed, true);
    assert.equal(page.data.coversReady, false);

    const retry = page.loadProductCovers();
    assert.equal(page.data.coversLoading, true);
    assert.deepEqual(Object.keys(page.data.readyCovers).sort(), goodIds);
    assert.equal(page.loadProductCovers(), undefined);
    await retry;
    assert.equal(page.data.coversFailed, true);
    assert.deepEqual(coverReads.slice(coverSources.length), [failedSource]);

    page.onHide();
    page.onShow();
    await page.shopCoversPending;
    assert.equal(page.data.coversReady, true);
    assert.equal(page.data.coversFailed, false);
    assert.equal(page.data.readyCovers[failed.id], true);
    assert.deepEqual(coverReads.slice(coverSources.length), [failedSource, failedSource]);

    const coverPath = page.data.releaseImageRoot + '/' + manifest.files[failed.cover].name;
    const originalCover = disk.get(coverPath).slice();
    // 保持 WebP 头和文件长度，模拟基础文件校验通过但页面无法解码的缓存。
    disk.get(coverPath)[12] ^= 255;
    const coverError = attempt => page.handleProductCoverError({
        currentTarget: { dataset: { coverId: failed.id, coverAttempt: attempt } },
    });
    coverError(0);
    assert.equal(page.data.coversFailed, true);
    assert.deepEqual(Object.keys(page.data.readyCovers).sort(), goodIds);
    await page.loadProductCovers();
    assert.equal(page.data.coversReady, true);
    assert.deepEqual(disk.get(coverPath), originalCover);
    assert.deepEqual(coverReads.slice(coverSources.length), [failedSource, failedSource, failedSource]);
    coverError(0);
    assert.equal(page.data.coversReady, true);

    const view = read('pages/shop/shop.wxml');
    for (const [slot, item] of [['photo', 'item'], ['detail-cover', 'detail'], ['cart-cover', 'item'], ['added-cover', 'detail']]) {
        const tag = view.match(new RegExp(`<image class="${slot}"[^>]*>`))[0];
        assert.ok(tag.includes(`readyCovers[${item}.id] ? ${item}.cover : '/assets/shop/felt/cream-panel.webp'`));
        assert.ok(tag.includes('), releaseImageRoot)}}'));
        assert.ok(tag.includes('binderror="handleProductCoverError"'));
    }
    assert.match(view, /class="retry-text cover-retry" disabled="\{\{coversLoading\}\}" bindtap="loadProductCovers"/);
});

test('lead images bypass queued supporting work and recover from a decode error', async () => {
    const image = Uint8Array.from(Buffer.from('RIFF\x08\0\0\0WEBPtest', 'latin1'));
    const background = ['home-1', 'home-2', 'home-3', 'home-4', 'home-5'];
    const files = Object.fromEntries(['hero', 'meadow', 'example', 'banner', ...background].map(name => [
        '/' + name + '.webp', { source: 'assets/' + name + '.bin', name: name + '.webp', size: image.length },
    ]));
    const root = 'wxfile://usr/xcwc-release-images/test';
    const privatePhoto = 'wxfile://usr/photo/user.webp';
    const disk = new Map([[privatePhoto, image]]);
    const reads = [];
    const unlinks = [];
    let releaseExample;
    const startedExample = new Promise(resolve => { releaseExample = resolve; });
    let finishExample;
    const allowExample = new Promise(resolve => { finishExample = resolve; });
    let finishHome;
    const allowHome = new Promise(resolve => { finishHome = resolve; });
    let startHome;
    const homeQueued = new Promise(resolve => { startHome = resolve; });
    let homeReads = 0;
    const fsManager = {
        mkdir({ success }) { success(); },
        stat({ path, success, fail }) {
            const file = disk.get(path);
            if (file) success({ stats: { size: file.length } });
            else fail();
        },
        async readFile({ filePath, position, length, success }) {
            if (filePath.endsWith('.bin')) {
                reads.push(filePath);
                if (filePath === 'assets/example.bin') {
                    releaseExample();
                    await allowExample;
                }
                if (filePath.startsWith('assets/home-')) {
                    if (++homeReads === 4) startHome();
                    await allowHome;
                }
                success({ data: image.buffer });
                return;
            }
            success({ data: disk.get(filePath).slice(position, position + length).buffer });
        },
        writeFile({ filePath, data, success }) { disk.set(filePath, new Uint8Array(data)); success(); },
        rename({ oldPath, newPath, success }) { disk.set(newPath, disk.get(oldPath)); disk.delete(oldPath); success(); },
        unlink({ filePath, success }) { unlinks.push(filePath); disk.delete(filePath); success(); },
    };
    const sandbox = {
        module: { exports: {} },
        require: () => ({ version: 'test', files }),
        wx: { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => fsManager },
        setTimeout,
        clearTimeout,
    };
    vm.runInNewContext(runtime, sandbox);
    const { page, prepare, resolve } = sandbox.module.exports;
    const definition = page({}, ['/hero.webp', '/meadow.webp', '/example.webp'], { hero: '/hero.webp', meadow: '/meadow.webp' });
    const instance = {
        data: { ...definition.data },
        setData(update, callback) { Object.assign(this.data, update); if (callback) callback(); },
    };
    const event = (name, epoch = instance.data.releaseArtworkEpoch) => ({
        currentTarget: { dataset: { releaseArtwork: name, releaseEpoch: epoch } },
        detail: { width: 750, height: 593 },
    });

    definition.onLoad.call(instance);
    definition.onReleaseArtworkError.call(instance, event('hero'));
    assert.equal(instance.data.releaseArtworkState, 'loading');
    await startedExample;
    assert.deepEqual(reads, ['assets/hero.bin', 'assets/meadow.bin', 'assets/example.bin']);
    assert.equal(instance.data.releaseImageState, 'loading');
    assert.equal(instance.data.releaseImageRoot, root);
    assert.equal(instance.data.releaseLeadReady, true);

    definition.onReleaseArtworkLoad.call(instance, event('meadow'));
    assert.equal(instance.data.releaseArtworkState, 'loading');
    definition.onReleaseArtworkError.call(instance, event('hero'));
    assert.equal(instance.data.releaseArtworkState, 'failed');
    const retry = definition.retryReleaseImages.call(instance);
    finishExample();
    await retry;
    await instance.releaseImagesPending;
    assert.equal(instance.data.releaseArtworkState, 'loading');
    assert.equal(instance.data.releaseImageState, 'ready');
    assert.deepEqual(reads, ['assets/hero.bin', 'assets/meadow.bin', 'assets/example.bin', 'assets/hero.bin']);
    assert.ok(unlinks.includes(root + '/hero.webp'));
    assert.ok(!unlinks.includes(root + '/meadow.webp'));

    definition.onReleaseArtworkLoad.call(instance, event('hero', 0));
    definition.onReleaseArtworkLoad.call(instance, event('meadow'));
    assert.equal(instance.data.releaseArtworkState, 'loading', 'The previous hero must not confirm a new attempt');
    definition.onReleaseArtworkError.call(instance, event('hero', 0));
    assert.equal(instance.data.releaseArtworkState, 'loading', 'The previous hero must not fail a new attempt');

    definition.onReleaseArtworkLoad.call(instance, event('hero'));
    definition.onReleaseArtworkLoad.call(instance, event('hero'));
    assert.equal(instance.data.releaseArtworkState, 'ready');
    assert.equal(await resolve(privatePhoto), privatePhoto);
    assert.equal(disk.get(privatePhoto), image);

    const otherPage = prepare(background.map(name => '/' + name + '.webp'));
    await homeQueued;
    const shop = page({}, ['/banner.webp'], { 'hero-image': '/banner.webp' });
    const shopInstance = { ...instance, data: { ...shop.data } };
    shop.onLoad.call(shopInstance);
    await new Promise(setImmediate);
    finishHome();
    await Promise.all([otherPage, shopInstance.releaseImagesPending]);
    assert.ok(reads.indexOf('assets/banner.bin') < reads.indexOf('assets/home-5.bin'));
    shop.onUnload.call(shopInstance);
});

test('artwork without a native callback offers retry after a foreground deadline', async () => {
    const image = Uint8Array.from(Buffer.from('RIFF\x08\0\0\0WEBPtest', 'latin1'));
    const disk = new Map();
    const reads = [];
    const timers = new Map();
    let timerId = 0;
    const files = Object.fromEntries(['hero', 'meadow'].map(name => [
        '/' + name + '.webp', { source: 'assets/' + name + '.bin', name: name + '.webp', size: image.length },
    ]));
    const fsManager = {
        mkdir({ success }) { success(); },
        stat({ path, success, fail }) { if (disk.has(path)) success({ stats: { size: image.length } }); else fail(); },
        readFile({ filePath, length, success }) {
            if (filePath.endsWith('.bin')) reads.push(filePath);
            success({ data: (disk.get(filePath) || image).slice(0, length).buffer });
        },
        writeFile({ filePath, data, success }) { disk.set(filePath, new Uint8Array(data)); success(); },
        rename({ oldPath, newPath, success }) { disk.set(newPath, disk.get(oldPath)); disk.delete(oldPath); success(); },
        unlink({ filePath, success }) { disk.delete(filePath); success(); },
    };
    const sandbox = {
        module: { exports: {} },
        require: () => ({ version: 'test', files }),
        wx: { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => fsManager },
        setTimeout(callback, ms) { timers.set(++timerId, { callback, ms }); return timerId; },
        clearTimeout(id) { timers.delete(id); },
    };
    vm.runInNewContext(runtime, sandbox);
    const definition = sandbox.module.exports.page({}, Object.keys(files), { hero: '/hero.webp', meadow: '/meadow.webp' });
    const instance = { data: { ...definition.data }, setData(update, callback) { Object.assign(this.data, update); callback?.(); } };
    const loaded = slot => definition.onReleaseArtworkLoad.call(instance, {
        currentTarget: { dataset: { releaseArtwork: slot, releaseEpoch: instance.data.releaseArtworkEpoch } },
        detail: { width: 750, height: 341 },
    });

    definition.onLoad.call(instance);
    await instance.releaseImagesPending;
    loaded('meadow');
    assert.equal(timers.size, 1);
    definition.onHide.call(instance);
    assert.equal(timers.size, 0);
    assert.equal(instance.data.releaseArtworkState, 'loading');
    definition.onShow.call(instance);
    const [id, deadline] = [...timers][0];
    assert.equal(deadline.ms, 12000);
    timers.delete(id);
    deadline.callback();
    assert.equal(instance.data.releaseArtworkState, 'failed');
    assert.equal(instance.data.releaseLeadReady, true);
    assert.equal(instance.data.releaseImageState, 'ready');

    await definition.retryReleaseImages.call(instance);
    await instance.releaseImagesPending;
    assert.deepEqual(reads, ['assets/hero.bin', 'assets/meadow.bin', 'assets/hero.bin']);
    loaded('hero');
    loaded('meadow');
    assert.equal(instance.data.releaseArtworkState, 'ready');
    assert.equal(timers.size, 0);
    definition.onUnload.call(instance);
});

test('shop carousel tracks the visible decode and retries only its failed image', async () => {
    const image = Uint8Array.from(Buffer.from('RIFF\x08\0\0\0WEBPtest', 'latin1'));
    const disk = new Map();
    const reads = [];
    const timers = new Map();
    let timerId = 0;
    const files = Object.fromEntries(['first', 'second', 'third'].map(name => [
        '/' + name + '.webp', { source: 'assets/' + name + '.bin', name: name + '.webp', size: image.length },
    ]));
    const fsManager = {
        mkdir({ success }) { success(); },
        stat({ path, success, fail }) { if (disk.has(path)) success({ stats: { size: image.length } }); else fail(); },
        readFile({ filePath, length, success }) {
            if (filePath.endsWith('.bin')) reads.push(filePath);
            success({ data: (disk.get(filePath) || image).slice(0, length).buffer });
        },
        writeFile({ filePath, data, success }) { disk.set(filePath, new Uint8Array(data)); success(); },
        rename({ oldPath, newPath, success }) { disk.set(newPath, disk.get(oldPath)); disk.delete(oldPath); success(); },
        unlink({ filePath, success }) { disk.delete(filePath); success(); },
    };
    const sandbox = {
        module: { exports: {} },
        require: () => ({ version: 'test', files }),
        wx: { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => fsManager },
        setTimeout(callback, ms) { timers.set(++timerId, { callback, ms }); return timerId; },
        clearTimeout(id) { timers.delete(id); },
    };
    vm.runInNewContext(runtime, sandbox);
    const paths = Object.keys(files);
    const definition = sandbox.module.exports.page({
        data: { bannerIndex: 0, banners: paths.map(image => ({ image })) },
        handleSlide({ detail }) { this.setData({ bannerIndex: detail.current }); },
        handleDot({ currentTarget }) { this.setData({ bannerIndex: currentTarget.dataset.index }); },
    }, paths, { 'hero-image': paths[0] });
    const instance = { data: { ...definition.data }, setData(update, callback) { Object.assign(this.data, update); callback?.(); } };
    const artwork = (method, index, epoch = instance.data.releaseArtworkEpoch) => definition[method].call(instance, {
        currentTarget: { dataset: { releaseArtwork: 'hero-image', releaseBanner: index, releaseEpoch: epoch } },
        detail: { width: 750, height: 341 },
    });
    const load = (index, epoch) => artwork('onReleaseArtworkLoad', index, epoch);
    const error = (index, epoch) => artwork('onReleaseArtworkError', index, epoch);
    const slide = current => definition.handleSlide.call(instance, { detail: { current } });
    const dot = index => definition.handleDot.call(instance, { currentTarget: { dataset: { index } } });
    const state = () => instance.data.releaseArtworkState;

    definition.onLoad.call(instance);
    await instance.releaseImagesPending;
    load(0);
    dot(1);
    assert.equal(state(), 'loading');
    const abandonedWatch = [...timers.values()][0];
    slide(2);
    assert.equal(timers.size, 1);
    assert.notEqual([...timers.values()][0], abandonedWatch);
    error(1);
    assert.equal(state(), 'loading');
    load(2);
    assert.equal(state(), 'ready');
    assert.equal(timers.size, 0);
    slide(1);
    assert.equal(state(), 'failed');
    dot(0);
    assert.equal(state(), 'ready');
    dot(1);

    await definition.retryReleaseImages.call(instance);
    await instance.releaseImagesPending;
    assert.deepEqual(reads, ['assets/first.bin', 'assets/second.bin', 'assets/third.bin', 'assets/second.bin']);
    assert.equal(instance.data.bannerIndex, 1);
    assert.equal(instance.data.releaseArtworkEpoch, 1);
    assert.equal(state(), 'loading');
    error(1, 0);
    assert.equal(state(), 'loading');
    const [id, deadline] = [...timers][0];
    assert.equal(deadline.ms, 12000);
    timers.delete(id);
    deadline.callback();
    assert.equal(state(), 'failed');
    load(1);
    assert.equal(state(), 'ready');
    assert.equal(timers.size, 0);
    definition.onUnload.call(instance);
});

test('shop cover preparation waits for visible banner decode, but proceeds on failure or timeout', async () => {
    const timers = new Map();
    let timerId = 0;
    const sandbox = {
        module: { exports: {} },
        require: () => ({ files: {} }),
        setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
        clearTimeout(id) { timers.delete(id); },
    };
    vm.runInNewContext(runtime, sandbox);
    const { page, waitForArtwork } = sandbox.module.exports;
    const definition = page({}, [], { 'hero-image': '/banner.webp' });
    const setup = () => ({
        data: { ...definition.data, releaseLeadReady: true, releaseImageState: 'ready' },
        setData(update) { Object.assign(this.data, update); },
    });
    const banner = name => ({
        currentTarget: { dataset: { releaseArtwork: name, releaseEpoch: 0 } },
        detail: { width: 750, height: 341 },
    });

    const loading = setup();
    const gate = waitForArtwork(loading);
    assert.equal(waitForArtwork(loading), gate);
    let coversStarted = false;
    const covers = gate.then(() => { coversStarted = true; });
    definition.onReleaseArtworkLoad.call(loading, banner('other-image'));
    await Promise.resolve();
    assert.equal(coversStarted, false);
    definition.onReleaseArtworkLoad.call(loading, banner('hero-image'));
    await covers;
    assert.equal(coversStarted, true);
    assert.equal(loading.data.releaseArtworkState, 'ready');
    assert.equal(timers.size, 0);

    const failed = setup();
    const afterFailure = waitForArtwork(failed);
    definition.onReleaseArtworkError.call(failed, banner('hero-image'));
    await afterFailure;
    assert.equal(failed.data.releaseArtworkState, 'failed');
    assert.equal(timers.size, 0);

    const slow = setup();
    const afterTimeout = waitForArtwork(slow);
    timers.values().next().value();
    await afterTimeout;
    assert.equal(slow.data.releaseArtworkState, 'loading');
    assert.equal(timers.size, 0);

    const unloaded = setup();
    const afterUnload = waitForArtwork(unloaded);
    definition.onUnload.call(unloaded);
    await afterUnload;
    assert.equal(timers.size, 0);
});
