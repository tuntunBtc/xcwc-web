'use strict';

// 下载一份图集，三个按钮共用临时文件。失败后本次页面生命周期不重试。
function createButtonArt(page, platform, url) {
    let closed = false;
    let failed = false;
    let task = null;
    const fallback = () => {
        if (closed || failed) return;
        failed = true;
        page.setData({ dockRemoteImage: '' });
    };
    if (typeof url === 'string' && /^https:\/\/[^\s/?#@]+(?:\/[^\s]*)?$/.test(url)) {
        try {
            task = platform.downloadFile({
                url,
                timeout: 10000,
                success(result) {
                    if (closed || failed) return;
                    if (result.statusCode !== 200 || !result.tempFilePath) return fallback();
                    page.setData({ dockRemoteImage: result.tempFilePath });
                },
                fail: fallback,
            });
        } catch (error) {
            fallback();
        }
    }
    return {
        fallback,
        dispose() {
            closed = true;
            if (task) task.abort();
        },
    };
}

module.exports = { createButtonArt };
