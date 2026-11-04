# XCWC 小窝页面完整素材

共 12 张独立透明 PNG：导航毛绒底板 1 张、操作按钮 3 张、导航图标 8 张。

## 本次补齐的四张

| 文件 | 内容 |
| --- | --- |
| nav-background.png | 奶白粉色毛绒导航底板，保留两端花叶，图标和文字位置留空 |
| button-feed.png | 谷物碗、小雏菊及毛绒底座，下方文字区留白 |
| button-water.png | 青绿色水池、粉色莲花及毛绒底座，下方文字区留白 |
| button-pet.png | 抚摸小黄鸟的手部图案及毛绒底座，下方文字区留白 |

## 实际图片尺寸

| 文件 | 像素尺寸 |
| --- | --- |
| nav-background.png | 2172 × 724 |
| button-feed.png | 1448 × 1086 |
| button-water.png | 1448 × 1086 |
| button-pet.png | 1448 × 1086 |

所有文件均为 RGBA PNG，保留透明背景与绒毛边缘。导航底板包含上下透明安全边距；布局时按可见底板位置叠加导航图标和文字。

## 导航图标

图标位于 nav-icons 目录，每张 1254 × 1254 像素。

| 导航项 | 棕色未选中 | 绿色选中 |
| --- | --- | --- |
| 小窝 | nav-home-default.png | nav-home-active.png |
| 城市 | nav-city-default.png | nav-city-active.png |
| 商城 | nav-shop-default.png | nav-shop-active.png |
| 我的 | nav-profile-default.png | nav-profile-active.png |

## 页面使用

- 三个操作按钮分别叠加“喂食 ›”“添水 ›”“摸摸 ›”，文字由页面控制。
- 导航底板上按四列排列图标和“小窝、城市、商城、我的”文字。
- 当前栏目使用对应 active 图标，其余使用 default 图标。
- 保留 PNG 透明通道；图片按比例缩放，避免拉伸图案和花叶。

## 制作

依据本轮提供的红框参考图，使用内置图像生成制作；本次四张素材的完整提示词见 PROMPTS.md。
