'use strict';

const catalog = require('../../utils/catalog');
const safeArea = require('../../utils/safe-area');
const shopLayout = require('../../utils/shop-layout');
const tabBar = require('../../utils/tab-bar');
const cartStorage = require('../../utils/cart-storage');

// 与网页端 src/shop/shop.js 的状态机对齐：品牌条角标、加购/已加购、购物车、
// 排序与城市筛选、详情浮层与文字信息、规则说明、轮播暂停/圆点、toast。
// 📌 本分支口径：只做「本机购物车」，不联网、不跳淘宝、不站内下单/支付、
// 不产生订单或鸟蛋；购物车只保存在本机，清除缓存即丢失。
// 商品文字与价格来自 xcwc-api 现行目录快照；详情长图含旧价与「加入购物车」
// 画面且 17 张合计 3.1MB，主包放不下，详情浮层改用动态封面 + 动态价格。
const PRODUCTS = catalog.PRODUCTS.slice();
const BANNERS = catalog.BANNERS.slice();
const CITIES = catalog.CITIES.slice();
const CITY_NAMES = CITIES.map(function (item) { return item.name; });
const CART_LIMIT = 100;
const ID_PATTERN = /^[a-z0-9_-]{1,64}$/;

function sortBy(list, sort) {
    const out = list.slice();
    if (sort === 'priceAsc') {
        out.sort(function (a, b) { return a.price - b.price || a.sortOrder - b.sortOrder; });
    } else if (sort === 'priceDesc') {
        out.sort(function (a, b) { return b.price - a.price || a.sortOrder - b.sortOrder; });
    } else {
        out.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    }
    return out;
}

function sortLabel(sort) {
    if (sort === 'priceAsc') return '价格 ↑';
    if (sort === 'priceDesc') return '价格 ↓';
    return '价格 ↕';
}

function findProduct(id) {
    for (let i = 0; i < PRODUCTS.length; i += 1) {
        if (PRODUCTS[i].id === id) return PRODUCTS[i];
    }
    return null;
}

// 旧记录兼容：去重、丢弃非法 ID 与已下架商品、限制上限。
function normalizeCart(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = {};
    const out = [];
    for (let i = 0; i < raw.length && out.length < CART_LIMIT; i += 1) {
        const id = raw[i];
        if (typeof id !== 'string' || !ID_PATTERN.test(id) || seen[id] || !findProduct(id)) continue;
        seen[id] = true;
        out.push(id);
    }
    return out;
}

Page({
    data: {
        // 顶部安全区与品牌条几何由 utils/shop-layout.js 按真实胶囊矩形计算。
        // 兜底值对应 375×812：读不到系统信息时也能保持「与胶囊同排、等比缩放」。
        topInset: 176,
        headerSpace: 176,
        viewportHeight: 1428,
        mastheadLeft: 12,
        mastheadTop: 108,
        mastheadScale: 0.75,
        banners: BANNERS,
        bannerIndex: 0,
        bannerAutoplay: BANNERS.length > 1,
        bannerDots: BANNERS.length > 1,
        carouselPaused: false,
        visibleProducts: [],
        total: 0,
        cityNames: CITY_NAMES,
        cityIndex: 0,
        cityLabel: '全部城市',
        sort: 'default',
        sortLabel: '价格 ↕',
        emptyVisible: false,
        cartCount: 0,
        cartItems: [],
        panelVisible: false,
        panelKind: '',
        panelTitle: '',
        detail: null,
        detailTextOpen: false,
        addedAlready: false,
        toastVisible: false,
        toastText: '',
    },

    onLoad() {
        this.cartIds = [];
        const layout = shopLayout.readShopLayout();
        this.setData({
            topInset: safeArea.readTopInsetRpx(),
            headerSpace: layout.headerSpace,
            viewportHeight: layout.viewportHeight,
            mastheadLeft: layout.mastheadLeft,
            mastheadTop: layout.mastheadTop,
            mastheadScale: layout.mastheadScale,
        });
        this.syncCart();
        this.applyFilter();
    },

    onShow() {
        // 自定义 tabBar 选中态由全站组件自校正，这里只做轻量同步（E-07）。
        tabBar.syncSelected(this, 2);
        this.syncCart();
    },

    onHide() {
        this.clearToast();
    },

    onUnload() {
        this.clearToast();
    },

    // ---- 列表与筛选 ----------------------------------------------------
    applyFilter() {
        const city = CITIES[this.data.cityIndex] || CITIES[0];
        const code = city.code;
        const cart = this.cartIds || [];
        const picked = code ? PRODUCTS.filter(function (item) { return item.cityCode === code; }) : PRODUCTS.slice();
        const visible = sortBy(picked, this.data.sort).map(function (item, index) {
            return Object.assign({}, item, {
                isLeft: index % 2 === 0,
                added: cart.indexOf(item.id) >= 0,
            });
        });
        this.setData({
            visibleProducts: visible,
            total: visible.length,
            emptyVisible: visible.length === 0,
        });
    },

    handleSortDefault() {
        if (this.data.sort === 'default') return;
        this.setData({ sort: 'default', sortLabel: sortLabel('default') });
        this.applyFilter();
    },

    handleSortPrice() {
        const next = this.data.sort === 'priceAsc' ? 'priceDesc' : 'priceAsc';
        this.setData({ sort: next, sortLabel: sortLabel(next) });
        this.applyFilter();
    },

    handleCityChange(event) {
        const value = Number(event.detail.value);
        const index = isNaN(value) ? 0 : value;
        this.setData({ cityIndex: index, cityLabel: CITY_NAMES[index] });
        this.applyFilter();
    },

    handleClearCity() {
        this.setData({ cityIndex: 0, cityLabel: CITY_NAMES[0] });
        this.applyFilter();
    },

    // ---- 详情浮层 ------------------------------------------------------
    handleOpen(event) {
        const product = findProduct(event.currentTarget.dataset.id);
        if (!product) return;
        const detail = Object.assign({}, product, {
            added: (this.cartIds || []).indexOf(product.id) >= 0,
        });
        this.setData({
            panelVisible: true,
            panelKind: 'detail',
            panelTitle: product.title,
            detail: detail,
            detailTextOpen: false,
        });
    },

    handleTextToggle() {
        this.setData({ detailTextOpen: !this.data.detailTextOpen });
    },

    // ---- 本机购物车 ----------------------------------------------------
    syncCart() {
        let next;
        try {
            next = normalizeCart(cartStorage.read());
            this.cartStorageUnavailable = false;
        } catch (error) {
            this.cartStorageUnavailable = true;
            return false;
        }
        const previous = this.cartIds || [];
        if (previous.length === next.length && previous.every(function (id, index) { return id === next[index]; })) return true;
        this.cartIds = next;
        const patch = { cartCount: next.length, cartItems: this.buildCartItems() };
        if (this.data.detail && this.data.panelKind === 'detail') {
            patch['detail.added'] = next.indexOf(this.data.detail.id) >= 0;
        }
        this.setData(patch);
        this.applyFilter();
        if (this.data.panelKind === 'added' && this.data.detail && next.indexOf(this.data.detail.id) < 0) this.handleClose();
        return true;
    },

    // 只更新变化字段，避免整表 setData（E-02）。
    syncAddedState(id, added) {
        const patch = { cartCount: this.cartIds.length };
        const list = this.data.visibleProducts;
        for (let i = 0; i < list.length; i += 1) {
            if (list[i].id === id && list[i].added !== added) {
                patch['visibleProducts[' + i + '].added'] = added;
            }
        }
        if (this.data.panelVisible && this.data.panelKind === 'detail' && this.data.detail && this.data.detail.id === id) {
            patch['detail.added'] = added;
        }
        this.setData(patch);
    },

    buildCartItems() {
        const ids = this.cartIds || [];
        const items = [];
        for (let i = 0; i < ids.length; i += 1) {
            const product = findProduct(ids[i]);
            if (product) items.push(product);
        }
        return items;
    },

    addToCart(id) {
        const product = findProduct(id);
        if (!product) return;
        if (this.cartStorageUnavailable && !this.syncCart()) {
            this.toast('本机存储不可用，加购未保存');
            return;
        }
        const already = this.cartIds.indexOf(id) >= 0;
        if (already) {
            this.showAdded(product, true);
            return;
        }
        if (this.cartIds.length >= CART_LIMIT) {
            this.toast('购物车最多保存 ' + CART_LIMIT + ' 只小鸟');
            return;
        }
        const next = this.cartIds.concat([id]);
        if (!cartStorage.write(next)) {
            this.toast('本机存储不可用，加购未保存');
            return;
        }
        this.cartIds = next;
        this.syncAddedState(id, true);
        this.showAdded(product, false);
    },

    handleAdd(event) {
        // catchtap：卡片主区域进入详情，右下圆钮只加购，不冒泡。
        this.addToCart(event.currentTarget.dataset.id);
    },

    handleDetailAdd(event) {
        this.addToCart(event.currentTarget.dataset.id);
    },

    showAdded(product, already) {
        this.setData({
            panelVisible: true,
            panelKind: 'added',
            panelTitle: already ? '这只小鸟已在购物车中' : '已加入购物车',
            detail: product,
            addedAlready: already,
        });
    },

    handleOpenCart() {
        this.setData({
            panelVisible: true,
            panelKind: 'cart',
            panelTitle: '我的购物车',
            cartItems: this.buildCartItems(),
            cartCount: this.cartIds.length,
            detail: null,
        });
    },

    handleCartRemove(event) {
        if (this.cartStorageUnavailable && !this.syncCart()) {
            this.toast('本机存储不可用，移除未保存');
            return;
        }
        const id = event.currentTarget.dataset.id;
        const index = this.cartIds.indexOf(id);
        if (index < 0) return;
        const next = this.cartIds.slice();
        next.splice(index, 1);
        if (!cartStorage.write(next)) {
            this.toast('本机存储不可用，移除未保存');
            return;
        }
        this.cartIds = next;
        this.syncAddedState(id, false);
        this.setData({ cartItems: this.buildCartItems() });
    },

    handleBuy() {
        this.toast('当前小程序不提供购买，购物车仅本机暂存');
    },

    // ---- 规则与浮层 ----------------------------------------------------
    handleRules() {
        this.setData({
            panelVisible: true,
            panelKind: 'rules',
            panelTitle: '一颗鸟蛋，一段城市旅程',
            detail: null,
        });
    },

    handleClose() {
        this.setData({ panelVisible: false, panelKind: '', detail: null, detailTextOpen: false });
    },

    // ---- 轮播 ----------------------------------------------------------
    handleSlide(event) {
        const current = Number(event.detail.current);
        this.setData({ bannerIndex: isNaN(current) ? 0 : current });
    },

    handleDot(event) {
        const index = Number(event.currentTarget.dataset.index);
        if (isNaN(index)) return;
        // 与网页端一致：手动切换后暂停自动轮播。
        this.setData({ bannerIndex: index, carouselPaused: true, bannerAutoplay: false });
    },

    handleCarouselPause() {
        const paused = !this.data.carouselPaused;
        this.setData({ carouselPaused: paused, bannerAutoplay: !paused && BANNERS.length > 1 });
    },

    // ---- toast ---------------------------------------------------------
    toast(message) {
        this.clearToast();
        this.setData({ toastVisible: true, toastText: message });
        this.toastTimer = setTimeout(() => {
            this.setData({ toastVisible: false, toastText: '' });
            this.toastTimer = null;
        }, 2800);
    },

    clearToast() {
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
            this.toastTimer = null;
        }
        if (this.data.toastVisible) {
            this.setData({ toastVisible: false, toastText: '' });
        }
    },

    noop() {},
});
