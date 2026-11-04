# 当前相机音效（2026-11-03）

构建使用 `camera.mp3`，由用户提供并确认已取得授权；不标为 AOSP 或 Apache-2.0 素材。

- 原文件：78,417 字节，44.1 kHz、立体声、192 kbps，约 3.265 秒。
- 原文件 SHA-256：`461e4f14adc048e443114cef7ced5d2dbab3a7567aec233602a80689e595c879`。
- 裁取 2.28–2.70 秒，保留完整快门和两端余量，去除长静音，不改速度。
- 优化文件：4,032 字节，32 kHz、单声道、64 kbps MP3，0.42 秒，无元数据。
- 构建 Base64 内嵌；首次有效点击才解码并缓存，沿用防叠音和资源释放。
- 以下为旧 AOSP 素材的历史来源与许可，不适用于当前 `camera.mp3`。

---

# 相机快门音效

`camera-shutter.mp3` 派生自 Android Open Source Project 的 Camera Shutter 样本。

- 版权所有：(c) 2012 Android Open Source Project。
- 许可：Apache License 2.0，全文见 `APACHE-2.0-LICENSE.txt`。
- 原始文件：`data/sounds/effects/ogg/camera_click_48k.ogg`。
- 固定版本：`1cdfff555f4a21f71ccc978290e2e212e2f8b168`。
- 来源：https://android.googlesource.com/platform/frameworks/base/+/1cdfff555f4a21f71ccc978290e2e212e2f8b168/data/sounds/effects/ogg/camera_click_48k.ogg
- 原始 SHA-256：`68f2f07f29dd7a72918ad03911f60031a350fda65b6b52ef8b2208a137de6d72`。
- 许可依据：同版本 `data/sounds/Android.bp` 的 `default_applicable_licenses: ["Android-Apache-2.0"]`，其 `frameworks_ui_48k_sounds` 明确列入该样本。
- 本项目修改（2026-11-03）：去除末尾静音，保留 0.35 秒原速快门；6.2 kHz 低通柔化高频，末尾 20 ms 淡出；转为 32 kHz 单声道 64 kbps MP3，移除元数据以减小体积。

构建时将小段 MP3 内嵌到打卡代码，首次有效点击异步解码并缓存，不发额外音频请求。此文件同时可作为本机试听资源；不用于用户照片上传。
