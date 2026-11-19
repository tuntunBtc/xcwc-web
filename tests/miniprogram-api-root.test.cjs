const test = require('node:test');
const assert = require('node:assert/strict');
const { apiRoot, assetUrl } = require('../miniprogram/utils/api-root');

test('仅允许正式和测试小鸟业务根及新素材地址', () => {
    const origin = 'https://api.xinchengip.com';
    assert.equal(apiRoot(origin + '/bird/v1'), origin + '/bird/v1');
    assert.equal(apiRoot(origin + '/test/bird/v1/'), origin + '/test/bird/v1');
    for (const suffix of ['', '/api', '/test/api', '/test', '/bird/v1?tail=1']) {
        assert.equal(apiRoot(origin + suffix), '');
    }
    const path = '/bird/v1/content/assets/0123456789abcdef0123456789abcdef';
    assert.equal(assetUrl(path), 'https://assets.xinchengip.com' + path);
    assert.equal(assetUrl(path.replace('/bird/v1', '/api')), '');
});
