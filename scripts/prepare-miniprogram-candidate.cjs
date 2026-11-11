'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { parseArgs } = require('node:util');

const SOURCE = path.resolve(__dirname, '../miniprogram');
const RUNTIME = path.join(__dirname, 'miniprogram-release-images-runtime.js');
const WXS = 'utils/release-images.wxs';
const RUNTIME_MODULE = 'utils/release-images';
const RUNTIME_FILES = /\.(?:js|json|wxml|wxss|wxs|webp|png|jpe?g|gif|svg|mp3|m4a|wav|aac|mp4)$/i;
const PHOTO_ROUTE = 'pages/photo/photo';
const SHOP_ROUTE = 'pages/shop/shop';
const ADOPT_ROUTE = 'pages/adopt/adopt';
const PHOTO_ARTWORK = {
    'hero-bg': '/pages/photo/assets/hero.webp',
    'page-meadow': '/pages/photo/assets/meadow.webp',
};
const ADOPT_ARTWORK = {
    'scene-art': '/pages/adopt/assets/scene.webp',
    'details-top': '/pages/adopt/assets/lower-top.webp',
    'details-bottom': '/pages/adopt/assets/lower-bottom.webp',
    'adopt-button-art': '/pages/adopt/assets/button.webp',
};

const read = file => fs.readFileSync(file, 'utf8');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const jsonModule = value => "'use strict';\nmodule.exports = " + JSON.stringify(value, null, 2) + ';\n';

function modulePath(file, target) {
    const relative = path.posix.relative(path.posix.dirname(file), target);
    return relative.startsWith('.') ? relative : './' + relative;
}

function requireRuntime(file) {
    return `const releaseImages = require('${modulePath(file, RUNTIME_MODULE)}');\n`;
}

function injectRequire(text, file) {
    const directive = /^\uFEFF?(['"])use strict\1;\s*\n/.exec(text);
    const offset = directive ? directive[0].length : Number(text.startsWith('\uFEFF'));
    return text.slice(0, offset) + requireRuntime(file) + text.slice(offset);
}

function replaceOnce(text, target, replacement, file) {
    const start = text.indexOf(target);
    if (start < 0 || text.indexOf(target, start + target.length) >= 0) {
        throw new Error(`${file} 未找到唯一的生成标记：${target}`);
    }
    return text.slice(0, start) + replacement + text.slice(start + target.length);
}

function renderView(text, file, files, artwork, shopArtwork) {
    const paths = new Set();
    const image = /<image(?=\s|>)(?:[^'"<>]|"[^"]*"|'[^']*')*>/g;
    let changed = false;
    let converted = text.replace(image, tag => tag.replace(/\bsrc="([^"]*)"/, (attr, value) => {
        const locals = value.match(/\/[\w/.-]+\.webp\b/g) || [];
        for (const local of locals) {
            if (!files[local]) throw new Error(`${file} 引用了未打包的素材 ${local}`);
            paths.add(local);
        }
        const expression = /^{{([\s\S]*)}}$/.exec(value);
        if (!locals.length && !expression) return attr;
        changed = true;
        const operand = expression ? `(${expression[1]})` : `'${value}'`;
        // 商品封面由各自的 readyCovers 控制，其他商城素材失败时仍可独立显示。
        const productCover = shopArtwork && value.includes('readyCovers[');
        const root = artwork && !productCover ? 'releaseImageRoot, releaseImageState, releaseLeadReady' : 'releaseImageRoot';
        return `src="{{releaseArt.resolve(${operand}, ${root})}}"`;
    }));
    if (!changed) return { text, paths };
    for (const [slot, path] of Object.entries(artwork || {})) {
        const operand = shopArtwork ? '(item.image)' : `'${path}'`;
        const marker = `<image class="${slot}" src="{{releaseArt.resolve(${operand}, releaseImageRoot, releaseImageState, releaseLeadReady)}}"`;
        const banner = shopArtwork ? ' data-release-banner="{{index}}"' : '';
        const ready = shopArtwork ? ' wx:if="{{(releaseLeadReady && index === 0) || releaseImageState === \'ready\'}}"' :
            ' wx:if="{{releaseLeadReady}}"';
        converted = replaceOnce(converted, marker, `${marker}${ready}${banner} data-release-epoch="{{releaseArtworkEpoch}}" data-release-artwork="${slot}" bindload="onReleaseArtworkLoad" binderror="onReleaseArtworkError"`, file);
    }
    if (artwork === ADOPT_ARTWORK) {
        converted = replaceOnce(converted, '<image class="immersive-top-art"',
            '<image class="immersive-top-art" wx:if="{{releaseLeadReady}}"', file);
    }
    if (shopArtwork) {
        converted = replaceOnce(converted, 'autoplay="{{bannerAutoplay && !panelVisible}}"',
            'autoplay="{{bannerAutoplay && !panelVisible && releaseArtworkState === \'ready\' && releaseImageState === \'ready\'}}"', file);
        converted = replaceOnce(converted, '</swiper>', `</swiper>
            <button wx:if="{{releaseArtworkState === 'failed' || (releaseImageState === 'failed' && (!releaseLeadReady || bannerIndex !== 0))}}" class="release-shop-artwork-status release-shop-artwork-retry" bindtap="retryReleaseImages">重试加载轮播图</button>
            <view wx:elif="{{releaseArtworkState === 'loading'}}" class="release-shop-artwork-status release-shop-artwork-loading" role="status">商城图片加载中…</view>`, file);
    }
    const importWxs = `<wxs src="${modulePath(file, WXS)}" module="releaseArt" />\n`;
    const bom = Number(converted.startsWith('\uFEFF'));
    const pageMeta = /^(?:\s|<!--[\s\S]*?-->)*<page-meta\b[\s\S]*?<\/page-meta>/.exec(converted.slice(bom));
    const insertion = bom + (pageMeta ? pageMeta[0].length : 0);
    return { text: converted.slice(0, insertion) + (pageMeta ? '\n' : '') + importWxs + converted.slice(insertion), paths };
}

function wrapController(text, file, kind, paths, artwork) {
    const method = kind === 'Component' ? 'component' : 'page';
    const wrapped = replaceOnce(text, `${kind}({`, `${kind}(releaseImages.${method}({`, file);
    if (!/\n\}\);\s*$/.test(wrapped)) throw new Error(`${file} 注册表达式结尾无法识别`);
    const args = [JSON.stringify([...paths].sort())];
    if (artwork) args.push(JSON.stringify(artwork));
    return injectRequire(wrapped.replace(/\n\}\);\s*$/, `\n}, ${args.join(', ')}));\n`), file);
}

function publicHttps(value) {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (url.protocol !== 'https:' || url.href !== url.origin + '/' ||
        !hostname.includes('.') || net.isIP(hostname) || /(?:^|\.)(?:localhost|local)$/.test(hostname)) {
        throw new Error('API 地址须使用微信后台可登记的 HTTPS 域名根地址');
    }
    return url.origin;
}

function createCandidate(output, args) {
    const project = JSON.parse(read(path.join(SOURCE, 'project.config.json')));
    const app = JSON.parse(read(path.join(SOURCE, 'app.json')));
    const config = require(path.join(SOURCE, 'utils/config.js'));
    if (args.fixture && args['step-supply']) throw new Error('微信步数补给联调需要真实模式，不能与本机示例同时启用');
    config.ENABLE_WERUN_SUPPLIES = args['step-supply'] === true;
    if (!args.fixture) {
        if (!/^wx[0-9a-f]{16}$/i.test(args.appid || '')) throw new Error('发行候选需要显式提供企业小程序 --appid');
        config.API_BASE = publicHttps(args['api-base']);
        config.USE_LOCAL_FIXTURE = false;
        config.DEBUG_DEMO_BIRD_CODE = '';
    } else {
        config.API_BASE = '';
        config.USE_LOCAL_FIXTURE = true;
        config.DEBUG_DEMO_BIRD_CODE = 'HZ-HY-9000000000000000001';
    }
    project.appid = args.appid || project.appid;
    project.projectname = args.fixture ? 'xcwc-release-media-local-fixture' : 'xcwc-release-candidate';
    project.description = args.fixture ? 'XCWC 本地媒体验收用模拟数据' : '卜叽岛 · 小鸟伙伴';
    project.setting.urlCheck = true;
    delete project.condition;

    const ignore = (project.packOptions || {}).ignore || [];
    const excluded = name => name === 'project.private.config.json' || path.posix.basename(name) === '.DS_Store' ||
        ignore.some(rule => (rule.type === 'file' && name === rule.value) ||
            (rule.type === 'folder' && (name === rule.value || name.startsWith(rule.value + '/'))));
    const all = new Map();
    function scan(relative = '') {
        for (const entry of fs.readdirSync(path.join(SOURCE, relative), { withFileTypes: true })) {
            const name = relative ? relative + '/' + entry.name : entry.name;
            if (excluded(name)) continue;
            if (entry.isDirectory()) scan(name);
            else if (entry.isFile() && RUNTIME_FILES.test(name)) all.set(name, fs.readFileSync(path.join(SOURCE, name)));
            else throw new Error(`小程序候选内存在不支持的文件类型：${name}`);
        }
    }
    scan();

    const files = {};
    const signatures = [];
    for (const name of [...all.keys()].sort()) {
        if (!name.endsWith('.webp')) continue;
        const content = all.get(name);
        if (content.toString('ascii', 0, 4) !== 'RIFF' || content.toString('ascii', 8, 12) !== 'WEBP') {
            throw new Error(`素材不是有效的 WebP 容器：${name}`);
        }
        const hash = digest(content);
        const binaryPath = name + '.bin';
        if (all.has(binaryPath)) throw new Error(`二进制素材路径冲突：${binaryPath}`);
        files['/' + name] = { source: binaryPath, name: hash.slice(0, 32) + '.webp', size: content.length, sha256: hash };
        signatures.push(name + ':' + hash);
        all.delete(name);
        all.set(binaryPath, content);
    }
    const version = (args.fixture ? 'fixture-' : '') + digest(signatures.join('\n')).slice(0, 20);
    const paths = Object.keys(files);
    if (!paths.length) throw new Error('未找到需要兼容打包的 WebP 素材');
    const under = prefix => paths.filter(name => name.startsWith(prefix));
    const firstBanner = require(path.join(SOURCE, 'utils/catalog.js')).BANNERS[0]?.image;
    const shopArtwork = Object.hasOwn(files, firstBanner) ? { 'hero-image': firstBanner } : null;
    const additions = {
        'pages/index/index': under('/assets/nest/'),
        'pages/shop/shop': under('/assets/shop/banners/'),
        'pages/photo/photo': under('/pages/photo/assets/'),
        'pages/wardrobe/wardrobe': under('/pages/wardrobe/assets/'),
        'custom-tab-bar/index': under('/assets/navigation/plush/'),
    };
    const routes = app.pages.concat((app.subpackages || app.subPackages || [])
        .flatMap(pkg => pkg.pages.map(page => pkg.root + '/' + page)));
    for (const route of routes.concat('custom-tab-bar/index')) {
        const view = route + '.wxml';
        const controller = route + '.js';
        const shop = route === SHOP_ROUTE && shopArtwork;
        const artwork = route === ADOPT_ROUTE ? ADOPT_ARTWORK : route === PHOTO_ROUTE ? PHOTO_ARTWORK : shop;
        const converted = renderView(all.get(view).toString('utf8'), view, files, artwork, shop);
        if (converted.text === all.get(view).toString('utf8')) continue;
        for (const name of additions[route] || []) converted.paths.add(name);
        const kind = route === 'custom-tab-bar/index' ? 'Component' : 'Page';
        if (kind === 'Page') {
            const photo = route === PHOTO_ROUTE;
            const adopt = route === ADOPT_ROUTE;
            const artworkLoadingCopy = adopt ? '正在准备领养场景…' : '正在准备合照场景…';
            const retry = shop ? "releaseImageState === 'failed' && releaseLeadReady && bannerIndex === 0 && releaseArtworkState !== 'failed'" :
                "releaseImageState === 'failed'" + (photo || adopt ? " || releaseArtworkState === 'failed'" : '');
            const inset = adopt ? ' style="bottom:calc({{bottomInset}}px + 96rpx)"' :
                photo ? ' style="bottom:{{toastBottom}}rpx"' : '';
            converted.text += `\n<button wx:if="{{${retry}}}" class="release-media-retry"${inset} bindtap="retryReleaseImages">图片加载失败，点此重试</button>\n`;
            const style = route + '.wxss';
            all.set(style, all.get(style).toString('utf8') + `
.release-media-retry {
    position: fixed;
    left: 24rpx;
    right: 24rpx;
    bottom: ${shop ? 'calc(180rpx + env(safe-area-inset-bottom))' : '164rpx'};
    z-index: 999;
    background: #fff9ea;
    color: #74522c;
    font-size: 26rpx;
}
`);
            if (photo || adopt) {
                converted.text += `<view wx:elif="{{releaseArtworkState === 'loading'}}" class="release-artwork-loading"${inset} role="status">${artworkLoadingCopy}</view>\n`;
                all.set(style, all.get(style) + `
.release-artwork-loading {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    z-index: 998;
    padding: 12rpx 24rpx;
    border-radius: 28rpx;
    background: #fff9ea;
    color: #74522c;
    font-size: 24rpx;
    white-space: nowrap;
    pointer-events: none;
    animation: release-artwork-appear 100ms ease-out 250ms both;
}
@keyframes release-artwork-appear {
    from { opacity: 0; }
    to { opacity: 1; }
}
`);
            }
            if (shop) all.set(style, all.get(style) + `
.release-shop-artwork-status {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 1;
    padding: 12rpx 24rpx;
    border-radius: 28rpx;
    background: #fff9ea;
    color: #74522c;
    font-size: 26rpx;
    white-space: nowrap;
}
.release-shop-artwork-loading {
    pointer-events: none;
    animation: release-shop-artwork-appear 100ms ease-out 250ms both;
}
.release-shop-artwork-retry { min-height: 44px; }
@keyframes release-shop-artwork-appear {
    from { opacity: 0; }
    to { opacity: 1; }
}
`);
        }
        all.set(view, converted.text);
        all.set(controller, wrapController(all.get(controller).toString('utf8'), controller, kind, converted.paths, artwork));
    }

    function edit(name, target, replacement) {
        all.set(name, replaceOnce(all.get(name).toString('utf8'), target, replacement, name));
    }

    const collections = {
        city: ['/media/collection/cities.webp'],
        profile: ['/media/collection/profile.webp'],
    };
    for (const name of Object.keys(collections)) {
        edit(`pages/${name}/${name}.js`, 'collectionMedia.load()', `collectionMedia.load('${name}')`);
    }
    const shopCoverGate = shopArtwork ? 'releaseImages.waitForArtwork(this)' : 'Promise.resolve()';
    edit(SHOP_ROUTE + '.js', '        return collectionMedia.load().then(media => media ? products.map(item => item.id) : []);',
        `        return ${shopCoverGate}.then(() => {
            if (!this.shopVisible || this.releaseImagesDisposed) return null;
            return collectionMedia.loadShopCovers(products, this.data.coverAttempts);
        });`);
    const collectionFile = 'utils/collection-media.js';
    edit(collectionFile, 'module.exports = { load };', `
const imagesByPage = ${JSON.stringify(collections)};
module.exports = {
    load(page) {
        return load().then(media => media && releaseImages.prepare(imagesByPage[page]).then(() => media)).catch(() => null);
    },
    loadShopCovers(products, attempts = {}) {
        return load().then(media => {
            if (!media) return [];
            const covers = products.map(item => {
                const prepared = attempts[item.id] > 0 ? releaseImages.refresh(item.cover) : releaseImages.prepare([item.cover]);
                return prepared.then(() => item.id, () => null);
            });
            return Promise.all(covers).then(ids => ids.filter(Boolean));
        });
    },
};`);
    all.set(collectionFile, injectRequire(all.get(collectionFile), collectionFile));
    edit('pages/index/index.js', "loadFiles: () => require.async('../../media/nest-idle/files.js'),",
        "loadFiles: () => require.async('../../media/nest-idle/files.js').then(async files => ({\n                ...files, atlasSrc: await releaseImages.resolve(files.atlasSrc),\n            })),");
    edit('pages/photo/photo.js', '    loadCanvasImage(canvas, path, direct) {',
        '    async loadCanvasImage(canvas, path, direct) {\n        path = await releaseImages.resolve(path);');

    all.set('utils/release-images-manifest.js', jsonModule({ version, files }));
    all.set('utils/release-images.js', fs.readFileSync(RUNTIME));
    const names = Object.fromEntries(paths.map(name => [name, files[name].name]));
    const lead = Object.fromEntries(Object.values({ ...PHOTO_ARTWORK, ...ADOPT_ARTWORK, ...shopArtwork }).map(name => [name, true]));
    all.set(WXS, `var names = ${JSON.stringify(names)};\nvar lead = ${JSON.stringify(lead)};\n` +
        "function resolve(src, root, state, leadReady) {\n  var name = names[src];\n  if (typeof name !== 'string') return src;\n  var usable = !state || state === 'ready' || (leadReady && lead[src] === true);\n  return root && usable ? root + '/' + name : '';\n}\nmodule.exports = {resolve: resolve};\n");
    all.set('project.config.json', JSON.stringify(project, null, 2) + '\n');
    all.set('utils/config.js', jsonModule(config));

    if (args.fixture) {
        for (const [name, value] of all) {
            if (!name.endsWith('.js')) continue;
            const text = value.toString('utf8');
            all.set(name, text.replaceAll('xcwc.mp.', 'xcwc.release-media-fixture.mp.')
                .replaceAll('xcwc.shop.cart.mp.v1', 'xcwc.release-media-fixture.cart.v1')
                .replaceAll("'auth_token'", "'xcwc.release-media-fixture.auth'"));
        }
    }

    fs.mkdirSync(output);
    for (const [name, contents] of all) {
        const file = path.join(output, name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, contents, typeof contents === 'string' ? 'utf8' : undefined);
    }
    console.log(`${output}\n${paths.length} 个 WebP 以可校验的二进制素材入包。${args.fixture ? '本地测试配置。' : '发行候选，仍需核验微信后台与真机。'}`);
}

try {
    const args = parseArgs({
        options: {
            output: { type: 'string' }, fixture: { type: 'boolean' }, appid: { type: 'string' },
            'api-base': { type: 'string' }, 'step-supply': { type: 'boolean' },
        },
    }).values;
    if (!args.output) throw new Error('用法：node scripts/prepare-miniprogram-candidate.cjs --output <新目录> [--fixture | --appid <小程序ID> --api-base <HTTPS地址> [--step-supply]]');
    createCandidate(path.resolve(args.output), args);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
