'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createButtonArt } = require('../miniprogram/utils/nest-button-art');

function harness(url = 'https://assets.example.invalid/cards.webp') {
    const updates = [];
    let download, downloads = 0, aborted = false;
    const page = { setData: value => updates.push(value) };
    const platform = {
        downloadFile(options) { downloads++; download = options; return { abort() { aborted = true; } }; },
    };
    const loader = createButtonArt(page, platform, url);
    return { updates, loader, get download() { return download; },
        get downloads() { return downloads; }, get aborted() { return aborted; } };
}

test('empty or non-HTTPS configuration leaves all three local images usable without network', () => {
    for (const url of ['', null, 'http://internal/cards.webp', 'content/pilots/cards.webp']) {
        const h = harness(url);
        assert.equal(h.downloads, 0);
        assert.deepEqual(h.updates, []);
    }
});
test('one atlas download supplies a shared local file to all three images', () => {
    const h = harness();
    h.download.success({ statusCode: 200, tempFilePath: 'wxfile://atlas' });
    assert.deepEqual(h.updates, [{ dockRemoteImage: 'wxfile://atlas' }]);
    assert.equal(h.downloads, 1);
});
test('HTTP errors and timeouts fall back without retry loops', () => {
    for (const mode of ['http', 'timeout']) {
        const h = harness();
        if (mode === 'http') h.download.success({ statusCode: 403, tempFilePath: 'wxfile://atlas' });
        else h.download.fail({ errMsg: 'timeout' });
        h.loader.fallback();
        assert.deepEqual(h.updates, [{ dockRemoteImage: '' }]);
        assert.equal(h.downloads, 1);
    }
});
test('renderer failure restores the atlas for all three and rejects late successful callbacks', () => {
    const h = harness();
    h.download.success({ statusCode: 200, tempFilePath: 'wxfile://atlas' });
    h.loader.fallback();
    h.download.success({ statusCode: 200, tempFilePath: 'wxfile://late' });
    h.loader.fallback();
    assert.deepEqual(h.updates, [{ dockRemoteImage: 'wxfile://atlas' }, { dockRemoteImage: '' }]);
    assert.equal(h.downloads, 1);
});
test('leaving the page aborts its download and ignores late results', () => {
    const h = harness();
    h.loader.dispose();
    h.download.success({ statusCode: 200, tempFilePath: 'wxfile://atlas' });
    assert.equal(h.aborted, true);
    assert.deepEqual(h.updates, []);
});
