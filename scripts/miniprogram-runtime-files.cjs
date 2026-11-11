'use strict';

const fs = require('node:fs');
const path = require('node:path');

const localRequire = /\brequire(?:\s*\.\s*async)?\s*\(\s*(['"])(\.{1,2}\/[^'"\r\n]+)\1(?=\s*[,\)])/g;
const localWxs = /<wxs\b[^>]*?\ssrc\s*=\s*(['"])(\.{1,2}\/[^'"\r\n]+)\1/g;

function isFile(root, name) {
    return !!fs.statSync(path.join(root, name), { throwIfNoEntry: false })?.isFile();
}

function collectRuntimeFiles(root, app) {
    const subpackages = app.subpackages || app.subPackages || [];
    const routes = app.pages.concat(subpackages.flatMap(pkg => pkg.pages.map(page => pkg.root + '/' + page)));
    const files = new Set(['app.js', 'app.json', 'utils/config.js']);
    const optional = ['app.wxss'];
    if (app.sitemapLocation) files.add(app.sitemapLocation);
    for (const page of routes) {
        files.add(page + '.js');
        files.add(page + '.wxml');
        optional.push(page + '.json', page + '.wxss');
    }
    if (app.tabBar?.custom) {
        files.add('custom-tab-bar/index.js');
        files.add('custom-tab-bar/index.json');
        files.add('custom-tab-bar/index.wxml');
        optional.push('custom-tab-bar/index.wxss');
    }
    for (const file of optional) {
        if (isFile(root, file)) files.add(file);
    }

    // 跟随页面脚本的同步及分包加载路径，也核对模板依赖的 WXS。
    const outside = [];
    for (const file of files) {
        const template = file.endsWith('.wxml');
        if (!template && !file.endsWith('.js') && !file.endsWith('.wxs')) continue;
        if (!isFile(root, file)) continue;
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        const contents = template ? source.replace(/<!--[\s\S]*?-->/g, '') : source;
        for (const [, , request] of contents.matchAll(template ? localWxs : localRequire)) {
            const target = path.posix.join(path.posix.dirname(file), request);
            if (target === '..' || target.startsWith('../')) {
                outside.push(file + ' → ' + request);
                continue;
            }
            files.add(path.posix.extname(target) ? target : target + (template ? '.wxs' : '.js'));
        }
    }
    return { files, outside };
}

module.exports = { collectRuntimeFiles, isFile };
