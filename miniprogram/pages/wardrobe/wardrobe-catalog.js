'use strict';

// 与网页端 src/wardrobe-catalog.mjs 的 WARDROBE_SKINS（kind === 'outfit' 部分）逐项一致。
// 网页端当前版本（需求基线 2026-11-05）明确「全部服装继续暂未开放」，
// 故本目录只用于展示：id / 名称 / 缩略图；price 保留以便日后开放兑换时无需重建数据。
// 不复制 lake_glow / sunset_glow 两枚光晕：H5 feltWardrobeContent 只过滤 kind==='outfit'。
const OUTFITS = Object.freeze([
    { id: 'huangying_osmanthus', name: '桂花披风', price: 30, thumb: '/pages/wardrobe/assets/huangying/osmanthus-320.webp' },
    { id: 'huangying_peach', name: '桃花披风', price: 30, thumb: '/pages/wardrobe/assets/huangying/peach-320.webp' },
    { id: 'huangying_bamboo', name: '竹影披风', price: 30, thumb: '/pages/wardrobe/assets/huangying/bamboo-320.webp' },
    { id: 'huangying_sakura', name: '樱花披风', price: 30, thumb: '/pages/wardrobe/assets/huangying/sakura-320.webp' },
    { id: 'huangying_scholar', name: '江南书生', price: 70, thumb: '/pages/wardrobe/assets/huangying/scholar-320.webp' },
    { id: 'huangying_moon', name: '月白花嫁', price: 70, thumb: '/pages/wardrobe/assets/huangying/moon-320.webp' },
    { id: 'huangying_jade', name: '青蛇仙子', price: 70, thumb: '/pages/wardrobe/assets/huangying/jade-320.webp' },
    { id: 'huangying_pilgrim', name: '小小行者', price: 70, thumb: '/pages/wardrobe/assets/huangying/pilgrim-320.webp' },
].map(Object.freeze));

// 网页端 pageNotice / 按钮文案，保持一字不差。
const CLOSED_NOTICE = '换装功能本期暂未开放';

module.exports = {
    OUTFITS: OUTFITS,
    CLOSED_NOTICE: CLOSED_NOTICE,
};
