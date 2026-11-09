'use strict';

const PRODUCTS = require('../../utils/catalog').PRODUCTS;

Page({
    data: {
        products: PRODUCTS,
        detail: null,
        detailOpen: false,
        notice: '商城当前仅做商品展示：不提供购买、下单、支付或订单管理，也不因浏览发放鸟蛋。',
    },

    handleOpen(event) {
        const id = event.currentTarget.dataset.id;
        let selected = null;
        for (let i = 0; i < PRODUCTS.length; i += 1) {
            if (PRODUCTS[i].id === id) {
                selected = PRODUCTS[i];
                break;
            }
        }
        if (!selected) {
            return;
        }
        this.setData({ detail: selected, detailOpen: true });
    },

    handleClose() {
        this.setData({ detail: null, detailOpen: false });
    },

    noop() {},
});
