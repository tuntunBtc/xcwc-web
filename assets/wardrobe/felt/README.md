# 衣橱 V2 背景（2026-11-03）

通过内置 `image_gen` 工具，依据用户提供的换装页参考图生成无文字场景。仅背景为位图；小鸟、余额、选鸟、兑换及穿戴按钮均独立渲染。未烘焙用户身份、编号或状态。

原始生成文件保留：`/Users/beluga/.codex/generated_images/01a1a168-cae6-7cc1-8a26-d0a2c4e97244/exec-d1d92e87-4b89-463c-bb16-f4e599b646ff.png`（1024 × 1536）。

运行素材：
- `scene-top-v2-900.webp`：原图 y=0..599，宽 900、WebP quality 85。
- `scene-lower-v2-900.webp`：原图 y=600..1535，宽 900、WebP quality 85。

用 Sharp 切片与编码，不重绘原图。上片高度按内容宽度保持比例，确保高屏上小鸟脚下的草地仍贴近预览底部；只拉伸下方场景。原始生成文件不进入发布包。

## 完整生成提示词

```text
Use case: precise-object-edit. Asset type: clean unlettered scenery background for an existing mobile wardrobe webpage. Edit target: attached screenshot, exact visual style reference. Recreate ONLY the dreamy soft pastel felt Jiangnan scenery behind this UI as a seamless single image, portrait 2:3. REMOVE ALL text, status bar, browser toolbar, title plaque, every cream UI panel, bird character, selector, buttons, cards and bottom navigation. No UI shapes or characters anywhere. Background composition: thin green willow branches frame the top and upper left, pastel turquoise lake with a tiny softly blurred pagoda upper right and pink trees behind; grass and tiny pink flowers forming a small stage at y 30% (where the bird will be placed separately via HTML), a couple pink felt mushrooms at right y30%; behind lower controls from y40% to65% continue a soft mint/turquoise lake and distant tiny pagoda with green leafy edges; bottom 30% transitions to soft yellow-green moss meadow, corner tiny wool flowers. Leave wide quiet open areas for future HTML controls; no central tree trunk or large canopy. Maintain reference's very luminous hazy gentle watercolor-like fiber detail, low contrast soft focus fluffy felt, spring lime/mint/cream/pastel pink palette. No overly dark forest, no dense strongly detailed grass, no photorealism. Output only the blank scene with no text, no bird, no UI, no watermark.
```
