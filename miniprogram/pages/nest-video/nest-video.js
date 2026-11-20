const VIDEO_URL = 'https://assets.xinchengip.com/bird/v1/oss/uploads/c9fe41e1a3a44877b6a3bfef69255bc2.mp4';

Page({
    data: { src: '', error: '', backTop: 48, backHeight: 32 },

    onLoad() {
        const menu = wx.getMenuButtonBoundingClientRect();
        if (menu && menu.height > 0 && menu.top > 0) {
            this.setData({ backTop: menu.top, backHeight: menu.height });
        }
    },

    onReady() {
        this.play();
    },

    play() {
        if (this.data.src || this.leaving) return;
        this.setData({ src: VIDEO_URL, error: '' });
    },

    onError() {
        if (this.leaving) return;
        this.setData({ src: '', error: '视频未能播放，请重试。' });
    },

    onHide() {
        if (!this.leaving && this.data.src) this.setData({ src: '' });
    },

    returnToNest(event) {
        if (this.leaving) return;
        this.leaving = true;
        // 保留当前帧直到页面退场，避免先渲染空播放器和重播按钮。
        if (event.type !== 'ended' && this.data.src) {
            wx.createVideoContext('bird-video', this).pause();
        }
        wx.navigateBack({
            fail: () => wx.switchTab({
                url: '/pages/index/index',
                fail: () => {
                    this.leaving = false;
                    this.setData({ src: '', error: '返回失败，请重试。' });
                },
            }),
        });
    },
});
