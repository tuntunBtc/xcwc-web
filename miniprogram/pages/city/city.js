'use strict';

const CITIES = require('../../utils/catalog').CITIES;
const store = require('../../utils/store');

Page({
    data: {
        cities: CITIES,
        birdCode: '',
        birdHint: '尚未领养小鸟',
        statusText: '状态待接',
        note: '城市解锁依赖服务端鸟蛋资格接口，调试期不默认解锁任何城市。',
    },

    onShow() {
        const result = store.snapshot();
        const snapshot = result.data.snapshot;
        this.setData({
            birdCode: snapshot.birdCode,
            birdHint: snapshot.hasBird ? '当前伙伴：' + snapshot.nickname : '尚未领养小鸟',
        });
    },
});
