'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '../miniprogram');
const source = fs.readFileSync(path.join(appRoot, 'pages/index/index.js'), 'utf8');
const app = JSON.parse(fs.readFileSync(path.join(appRoot, 'app.json'), 'utf8'));

function harness() {
    let page;
    const navigation = [];
    const toasts = [];
    const modules = {
        './spark': { presentSpark: () => ({}) },
        '../../utils/cloud-ui': { page: definition => definition },
    };
    vm.runInNewContext(source, {
        Page: definition => { page = definition; },
        require: name => modules[name] || {},
        wx: { navigateTo: options => navigation.push(options) },
    });
    page.showToast = message => toasts.push(message);
    return { page, navigation, toasts };
}

function tapTool(page, key) {
    return page.onTool({ currentTarget: { dataset: { key } } });
}

test('日记是播放下方最后一个工具并打开独立日记页', async () => {
    const { page, navigation } = harness();
    assert.deepEqual(
        Array.from(page.data.tools, item => item.key),
        ['clean', 'supply', 'checkin', 'ar', 'video', 'diary'],
    );
    assert.ok(app.subpackages.some(item =>
        item.root === 'pages/diary' && item.pages.includes('diary') && !item.independent,
    ));
    await tapTool(page, 'diary');
    assert.equal(navigation[0].url, '/pages/diary/diary');
});

test('日记导航防止重复点击，进入失败后可点击重试', async () => {
    const { page, navigation, toasts } = harness();
    await tapTool(page, 'diary');
    await tapTool(page, 'diary');
    assert.equal(navigation.length, 1);
    navigation[0].fail();
    navigation[0].complete();
    await tapTool(page, 'diary');
    assert.equal(navigation.length, 2);
    assert.deepEqual(toasts, ['日记暂时打不开，请重试']);
});

test('原播放按钮仍然打开视频页', async () => {
    const { page, navigation } = harness();
    await tapTool(page, 'video');
    assert.equal(navigation[0].url, '/pages/nest-video/nest-video');
});
