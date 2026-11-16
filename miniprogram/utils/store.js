'use strict';
// 历史 guest-store 及其缓存原样保留；正式小程序永不读取或结算该存档。
module.exports = require('./cloud-store').createCloudStore(wx, require('./config'));
