// 商城/城市页的本地展示快照。
// 数据来源：xcwc-api/src/main/resources/shop/catalog.json（项目现行商品目录），
// 封面来源：xcwc-web/dist/assets/shop/products/*/cover-480.webp（现行 H5 派生素材）。
// 正式版改由 /api/shop/products 只读接口提供；按本分支决策不接入网络、
// 不提供购买链接、不做淘宝跳转、不产生订单或鸟蛋。
// 注意：这里只取目录中的 id / title / cityName / remark / price，不含 purchaseUrl。
const PRODUCTS = [
    {
        id: 'hangzhou-xihu',
        name: '西湖小鸟毛绒',
        city: '杭州',
        priceText: '¥ 79',
        tag: '互动发声毛绒玩偶',
        cover: '/assets/shop/product-1.webp',
        description: '杭州城市系列 · 互动发声毛绒玩偶。资料来自项目商品目录，本页仅供浏览，暂未开通购买。',
    },
    {
        id: 'hangzhou-baitou-gaojie',
        name: '白头高洁',
        city: '杭州',
        priceText: '¥ 79',
        tag: '互动发声毛绒玩偶',
        cover: '/assets/shop/product-2.webp',
        description: '杭州城市系列 · 互动发声毛绒玩偶。资料来自项目商品目录，本页仅供浏览，暂未开通购买。',
    },
    {
        id: 'hangzhou-jiangnan-lingyu',
        name: '江南灵羽',
        city: '杭州',
        priceText: '¥ 79',
        tag: '互动发声毛绒玩偶',
        cover: '/assets/shop/product-3.webp',
        description: '杭州城市系列 · 互动发声毛绒玩偶。资料来自项目商品目录，本页仅供浏览，暂未开通购买。',
    },
    {
        id: 'hangzhou-taozhi-cuiniao',
        name: '桃枝翠鸟',
        city: '杭州',
        priceText: '¥ 79',
        tag: '互动发声毛绒玩偶',
        cover: '/assets/shop/product-4.webp',
        description: '杭州城市系列 · 互动发声毛绒玩偶。资料来自项目商品目录，本页仅供浏览，暂未开通购买。',
    },
];

// 城市页展示清单：取自现行商品目录中实际出现的城市，数量为已上架商品数。
// 解锁状态依赖服务端鸟蛋资格接口，调试期统一显示「状态待接」。
const CITIES = [
    { id: 'hangzhou', name: '杭州', hint: '商品目录已收录 11 款小鸟' },
    { id: 'suzhou', name: '苏州', hint: '商品目录已收录 3 款小鸟' },
    { id: 'luoyang', name: '洛阳', hint: '商品目录已收录 1 款小鸟' },
    { id: 'taizhou', name: '台州', hint: '商品目录已收录 1 款小鸟' },
    { id: 'shaoxing', name: '绍兴', hint: '商品目录已收录 1 款小鸟' },
];

module.exports = { PRODUCTS, CITIES };
