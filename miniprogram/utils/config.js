// API_BASE 为服务根地址（不含 /api）。未部署时留空，禁止回退到本机权益或旧网关。
// 隔离联调配置在独立候选目录生成，不将测试地址写入正式源码。
module.exports = {
    API_BASE: '',
    // 由后端交接已验证的 HTTPS 图集地址；留空时使用包内原图。
    NEST_BUTTONS_IMAGE_URL: '',
    USE_LOCAL_FIXTURE: false,
    ENABLE_WERUN_SUPPLIES: false,
    DEBUG_DEMO_BIRD_CODE: '',
};
