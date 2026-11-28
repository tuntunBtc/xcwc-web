'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const mini = path.resolve(__dirname, '../miniprogram');

function definition(relativeFile, registration, globals = {}) {
    const filename = path.join(mini, relativeFile);
    const localRequire = createRequire(filename);
    const modules = {
        '../../utils/store': {},
        '../../utils/cloud-ui': { page: value => value },
    };
    let captured;
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        ...globals,
        require: name => modules[name] || localRequire(name),
        [registration]: value => { captured = value; },
        clearTimeout,
    }, { filename });
    return captured;
}

function tap(dataset) {
    return { currentTarget: { dataset } };
}

test('小窝底部网格打开互动菜单，商城与空页面栈不触发', () => {
    let calls = 0;
    const stack = [];
    const bar = definition('custom-tab-bar/index.js', 'Component', { getCurrentPages: () => stack });
    const template = fs.readFileSync(path.join(mini, 'custom-tab-bar/index.wxml'), 'utf8');
    const entry = template.match(/<view\b[^>]*\bid="corgi-open"[^>]*>/)?.[0];
    assert.ok(entry);
    assert.match(entry, /bindtap="openCorgiMenu"/);
    assert.match(entry, /hidden="{{corgiMenuOpen}}"/);
    bar.methods.openCorgiMenu();
    stack.push({ route: 'pages/shop/shop', toggleCorgiMenu: () => calls++ });
    bar.methods.openCorgiMenu();
    assert.equal(calls, 0);
    stack.push({ route: 'pages/index/index', toggleCorgiMenu: () => calls++ });
    bar.methods.openCorgiMenu();
    assert.equal(calls, 1);
});

test('打工入口列出两个岗位，每个岗位三张独立照片，切换与关闭时复位', () => {
    const page = definition('pages/index/index.js', 'Page');
    const changes = [];
    const bar = definition('custom-tab-bar/index.js', 'Component', { getCurrentPages: () => [page] });
    page.route = 'pages/index/index';
    page.cloudVisible = true;
    page.setData = values => Object.assign(page.data, values);
    page.getTabBar = () => ({ setData: values => changes.push(values.corgiMenuOpen) });
    // 本用例锁定菜单状态；相册返回后的待机播放由播放器用例负责。
    page.scheduleBirdSleep = () => {};
    page.showBirdClip = () => {};
    bar.methods.openCorgiMenu();
    assert.equal(page.data.corgiMenuOpen, true);
    page.selectCorgiCategory(tap({ category: 'work' }));
    assert.equal(page.data.corgiCategory, 'work');
    const checked = new Set();
    for (const [key, label] of [['cafe', '鸟咖帮忙'], ['model', '宠物模特']]) {
        page.selectCorgiJob(tap({ job: key }));
        const job = page.data.corgiJob;
        assert.equal(job.label, label);
        assert.equal(job.photos.length, 3);
        for (const url of job.photos) {
            assert.match(url, /^https:\/\/assets\.xinchengip\.com\/bird\/v1\/oss\/uploads\/[a-f0-9]{32}\.webp$/);
            checked.add(url);
        }
        page.changeCorgiWorkPhoto({ ...tap({ job: key }), detail: { current: 2 } });
        assert.equal(page.data.corgiWorkIndex, 2);
        page.changeCorgiWorkPhoto({ ...tap({ job: 'previous' }), detail: { current: 0 } });
        assert.equal(page.data.corgiWorkIndex, 2);
        page.leaveCorgiJob();
        assert.equal(page.data.corgiJob, null);
        assert.equal(page.data.corgiWorkIndex, 0);
    }
    assert.equal(checked.size, 6);
    page.selectCorgiJob(tap({ job: 'cafe' }));
    page.closeCorgiWork();
    assert.equal(page.data.corgiMenuOpen, false);
    assert.deepEqual(changes, [true, false]);
});
