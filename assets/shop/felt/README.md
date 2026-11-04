# 商城粉绒素材 / 2026-11-03

仅用于 `src/shop` 的商城视觉，原图及公共素材均未覆盖，不影响公共底部导航。商品封面、标题、备注、价格、ID、购买链接和详情长图由接口/清单数据提供；这些素材不包含真实或演示商品数据。

| 文件 | 用途 | 来源 |
| --- | --- | --- |
| card-560.webp | 商品 item 共用的空白粉绒底板，560×700，透明圆角外部 | 内置 imagegen 生成，见下方提示词；原输出保留 |
| pink-pill-800.webp | 商城顶栏、筛选和规则条的粉绒底板 | 复制 `assets/nest/felt/pill-v2-800.webp`，原件未修改 |
| green-button-720.webp | 商城绿色选中态和真实操作按钮 | 复制 `assets/adopt-v1/felt/button-720.webp`，原件未修改 |
| cream-panel-900.webp | 固定中部宣传区及装饰底纹 | 复制 `assets/adopt-v1/felt/panel-900.webp`，原件未修改 |

生成模式：内置 imagegen，透明输出。参考图为用户已确认的商城效果图 `/Users/beluga/.codex/generated_images/01a19fe5-7331-7b12-9329-0b33606c78b7/exec-f1c48c7c-3bce-40ec-8908-54b52107b45e.png`，仅作为材质和颜色参考。

原生成输出：`/Users/beluga/.codex/generated_images/01a1a063-518e-71b0-877d-6ebbccda7b13/exec-7ea92d7b-7119-4b09-8bda-11d8f7b88279.png`。

## 最终生成提示词

Use case: ui-mockup. Asset type: one reusable EMPTY product-card background for the approved plush bird shop UI, not a complete screen. Reference image role: use attached shop UI solely as exact visual/material reference, especially the two warm pink plush product cards near the bottom. Create one isolated vertically oriented rounded rectangle card shell, aspect 4:5, centered and nearly filling the canvas. Delicate pale peach/blush pink short plush wool felt across its entire empty interior, a thick soft cream-white fuzzy rounded border with fine individual fibers. Small natural soft shadow outside. Preserve the reference's very pale warm pink and ivory palette, hyperreal tiny fiber texture and premium toy-like softness, front-on orthographic, uniform lighting. The whole interior is a single empty pale pink wool surface, ready for product image and dynamic HTML text to be overlaid. NO bird, NO product image, NO picture window, NO extra nested panels, NO flowers, NO leaves, NO green badges, NO icons, NO prices, NO letters or text, NO watermark. Transparent outside the rounded card. Only one blank reusable plush card background.

## 使用边界

- 本目录没有导航图片，不应替换公共底栏。
- 商品详情每款是一张完整长图，样式 `.detail-image` 保留图片原比例；没有复用或修改旧版详情定稿背景。
- `.detail-add-btn` 为真实操作按钮，与长图中可能烘焙的按钮图案区分；不可把长图内的装饰按钮当成已绑定交互。
- 素材字节与尺寸见 `asset-report.json`。
