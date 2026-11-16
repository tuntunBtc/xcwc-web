'use strict';

function state(mode, badge, message, action, button) {
    return { mode, badge, message, action, button, tier: 1, dim: true, spark: null, deadline: '' };
}

function presentSpark(snapshot, connection) {
    if (!connection.signedIn) {
        return state('login', '火花', '微信登录后，陪伴记录可在云端保存。', 'login', '微信登录');
    }
    if (connection.loading && !connection.synced && !connection.error) {
        return state('loading', '同步中', '正在同步火花…', '', '知道啦');
    }
    if (!connection.online || !connection.synced || connection.error === 'INVALID_RESPONSE') {
        const message = connection.error === 'INVALID_RESPONSE'
            ? '火花同步异常，请刷新后重试。' : '火花暂未同步，联网后重试。';
        return state('stale', '待同步', message, connection.online ? 'retry' : '', connection.online ? '重试同步' : '知道啦');
    }
    if (!snapshot || !snapshot.hasBird) {
        return state('empty', '火花', '领养小鸟后，就能点亮你们的第一天。', 'adopt', '查看领养方式');
    }
    const spark = snapshot.spark;
    if (!spark) return state('unavailable', '火花', '当前服务暂未提供火花功能。', '', '知道啦');

    const level = Math.max(spark.level, spark.frozenLevel);
    const tier = level >= 100 ? 4 : level >= 30 ? 3 : level >= 7 ? 2 : 1;
    let view;
    switch (spark.status) {
        case 'UNLIT':
            view = state('ready', '待点亮', '摸摸我，点亮我们的第一天', 'pet', '摸摸小鸟');
            break;
        case 'ACTIVE':
            view = spark.effectiveToday
                ? state('ready', '', '今天的陪伴记下啦', '', '知道啦')
                : state('ready', '', '今天陪我一会儿，火花就能再升一级', 'pet', '摸摸小鸟');
            view.badge = spark.level > 99 ? 'Lv.99+' : 'Lv.' + spark.level;
            view.dim = false;
            break;
        case 'RECOVERABLE':
            view = state('ready', '可恢复', '我们的 Lv.' + level + ' 火花还在，连续陪伴 3 天就能找回来',
                'pet', '摸摸，开始恢复');
            break;
        case 'RECOVERING':
            view = spark.effectiveToday
                ? state('ready', '', '恢复第 ' + spark.recoveryProgress + ' 天已完成，明天继续', '', '知道啦')
                : state('ready', '', '恢复进度 ' + spark.recoveryProgress + '/3，今天再陪我一会儿', 'pet', '摸摸，继续恢复');
            view.badge = '恢复 ' + spark.recoveryProgress + '/3';
            break;
        case 'EXPIRED':
            view = state('ready', '重新点亮', '从今天重新点亮，过去的亲密度一直都在', 'pet', '摸摸，重新点亮');
            break;
        default:
            return state('stale', '待同步', '火花同步异常，请刷新后重试。', 'retry', '重试同步');
    }
    view.spark = spark;
    view.tier = tier;
    if (spark.recoveryDeadline) {
        const [year, month, day] = spark.recoveryDeadline.split('-').map(Number);
        const date = year + ' 年 ' + month + ' 月 ' + day + ' 日';
        view.deadline = spark.status === 'RECOVERABLE' ? '请在 ' + date + '结束前开始恢复'
            : '原开始期限 ' + date + ' · 已开始，继续陪伴即可';
    }
    return view;
}

function sparkNotice(event, spark) {
    if (!spark || !spark.effectiveToday) return '';
    switch (event) {
        case 'LIT': return '我们的火花点亮啦 · Lv.1';
        case 'RELIT': return '火花重新点亮啦 · Lv.1';
        case 'LEVELED': return '火花升到 Lv.' + spark.level + '，亲密度 +1';
        case 'RECOVERY_STARTED':
        case 'RECOVERY_PROGRESS': return '恢复进度 ' + spark.recoveryProgress + '/3，今天的陪伴已记下';
        case 'RESTORED': return '火花回来啦 · Lv.' + spark.level;
        default: return '';
    }
}

module.exports = { presentSpark, sparkNotice };
