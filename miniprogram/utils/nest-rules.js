'use strict';

// 网页端 src/nest/nest.js 中不依赖 DOM 的展示规则，移植为纯模块。
// 与 utils/guest-store.js 一样不触碰 wx / document，便于以后平移到服务端结算层。
// 调试期只有一只本机小鸟，故不带多鸟、衣橱、展览模式与后端 RPC 分支。

var ERROR_TEXT = Object.freeze({
    NO_BIRD: '请先领养一只小鸟',
    COOLDOWN: '小鸟还在回味，稍等一下',
    DAILY_LIMIT: '今日叽分已达上限',
    NO_FOOD: '食物不够了，去补给看看',
    NO_WATER: '水不够了，去补给看看',
    INVALID_STEPS: '步数数据不可用',
    ALREADY_CLAIMED: '今日步数已经兑换过',
    NO_REWARD: '今日暂无可兑换叽分',
    STORAGE_UNAVAILABLE: '本机数据写入失败，请重试',
    INVALID_NICKNAME: '昵称需为 1–6 个字符',
});

var EMOTION_NAMES = Object.freeze({
    happy: '开心', veryhappy: '很开心', hungry: '肚子饿了',
    thirsty: '想喝水', unwell: '想你陪陪', puzzled: '好奇',
    angry: '被摸痒了', crying: '想念你',
});

// 与 H5 nestEmotionArtwork 对齐；本端素材文件见 assets/nest/。
// 调试版只保留网页端 14 张情绪图中实际会触发的 4 种状态，其余复用最近的表情，
// 避免为凑视觉把整组素材塞进主包。原先的 puzzled/angry 在没有「逗逗」交互时不会出现。
var EMOTION_ART = Object.freeze({
    happy: 'poster.webp', veryhappy: 'emotion-happy.webp',
    hungry: 'emotion-hungry.webp', thirsty: 'emotion-hungry.webp',
    unwell: 'emotion-unwell.webp', crying: 'emotion-unwell.webp',
    puzzled: 'emotion-hungry.webp', angry: 'emotion-hungry.webp',
});

// 与 H5 describeNestState 对齐：按最紧迫的生理需求排序，心情低于 50 追加陪伴需求。
function describeNestState(care, hasBird) {
    if (!hasBird) {
        return {
            emotion: 'happy',
            need: null,
            mood: null,
            moodLabel: '状态待接',
            speech: '碰一碰实体小鸟，领取第一位伙伴。',
            needs: [],
        };
    }
    var hunger = Number(care.satiety);
    var water = Number(care.hydration);
    var mood = Number(care.mood);
    var needs = [];
    if (water < 30) {
        needs.push({
            key: 'water', label: '想喝水', emotion: 'thirsty', value: water,
            speech: water <= 10 ? '先给我添点水吧，润润小嗓子～' : '想喝点水，润润小嗓子～',
        });
    }
    if (hunger < 30) {
        needs.push({
            key: 'food', label: '肚子饿了', emotion: 'hungry', value: hunger,
            speech: hunger <= 10 ? '先给我一点谷粒吧，肚子空空的啦～' : '肚子有点空空的，想吃谷粒啦。',
        });
    }
    needs.sort(function (a, b) { return a.value - b.value; });
    if (mood < 50) {
        needs.push({ key: 'company', label: '想你陪陪', emotion: 'unwell', value: mood, speech: '有一点点想你，陪我待一会儿吧～' });
    }
    var current = needs.length ? needs[0] : null;
    return {
        emotion: current ? current.emotion : 'happy',
        need: current ? current.key : null,
        mood: mood,
        moodLabel: mood >= 50 ? '开心' : '想你陪陪我',
        speech: current ? current.speech : '阳光正好，\n陪我待一会儿吧～ ♥',
        needs: needs,
    };
}

// 与 H5 nestCareCopy 对齐：照料结果同时更新气泡与提示，未变化时不重复领奖文案。
function careCopy(action, changed) {
    if (changed === false) {
        return { speech: null, notice: action === 'feed' ? '已经吃饱啦，本次未消耗食物' : '水分已满，本次未消耗水' };
    }
    var speech = {
        feed: '吃得香香的',
        water: '水分补充好啦',
        clean: '小窝打扫干净啦',
        pet: '嘿嘿，你摸摸我，我就开心啦～',
        supply: '这下可以安心玩啦～',
    }[action] || '';
    return { speech: speech, notice: '' };
}

function emotionArt(emotion) {
    return '/assets/nest/' + (EMOTION_ART[emotion] || EMOTION_ART.happy);
}

function characterCount(value) {
    return Array.from(String(value || '')).length;
}

module.exports = {
    ERROR_TEXT: ERROR_TEXT,
    EMOTION_NAMES: EMOTION_NAMES,
    describeNestState: describeNestState,
    careCopy: careCopy,
    emotionArt: emotionArt,
    characterCount: characterCount,
};
