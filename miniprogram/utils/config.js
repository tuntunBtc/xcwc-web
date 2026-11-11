// 调试期配置。备案域名与 request 合法域名就绪后，把 API_BASE 换成正式 HTTPS 域名，
// 并把 USE_LOCAL_FIXTURE 关掉；不要把本机 IP 或测试地址写进发布包。
module.exports = {
    API_BASE: '',
    USE_LOCAL_FIXTURE: true,
    ENABLE_WERUN_SUPPLIES: false,

    // 调试期步数入口：模拟 wx.getWeRunData 解密后的「当日步数」。
    // 正式实现必须由服务端用 session_key 解密 encryptedData，
    // 前端只拿服务端结算后的可兑换结果，不自行发放叽分。
    DEBUG_TODAY_STEPS: 6800,

    // 步数兑换服务端接口。前端只提交密文（encryptedData/iv）与一次性 requestId，
    // 由后端 WxRunService 用 session_key 解密并按北京时间自然日幂等结算。
    STEPS_REDEEM_ENDPOINT: '/api/steps/redeem',

    // 调试期示例实体编码：仅用于预览卡/站内入口模拟「NFC 链接带 birdCode 进入领养页」。
    // 正式接入 URL Link / URL Scheme 后删除，编码一律来自链接参数，不再内置示例。
    DEBUG_DEMO_BIRD_CODE: 'HZ-HY-2116909225920720901',

    // 调试期规则草案，待产品确认后写入需求基线。
    POINTS_DAILY_LIMIT: 10,
    STEP_UNIT: 1000,
    STEP_DAILY_CAP: 5,
};
