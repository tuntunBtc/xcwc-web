# 小黄莺服装透明素材（2026-11-03）

来源：`/Users/beluga/Code/xcwc/小鸟资料库/皮肤/`，8 张原始 PNG 均保留，不复制进发布资源目录。

使用内置 `image_gen`（透明背景模式）按原图逐张提取角色，再用 Sharp 等比缩小并放入统一透明画布，保留完整头冠、裙摆、帽子、头纱及法杖。不是 Python 色键抠图，未使用外部 CLI/API。图片生成式去背景存在像素差异，不宣称无损提取；已对照原件逐套复核主要服饰造型和道具，未见明显改造或丢失。

## 网页文件

每套提供 640×580 主图和 320×290 缩略图；均有有效 alpha（0..255），WebP quality 88、alphaQuality 100、effort 6。16 个文件合计 749,974 bytes，实际像素、文件大小、SHA-256、透明通道及输入路径见 [asset-report.json](asset-report.json)。价格和稳定皮肤 ID 在 `src/wardrobe-catalog.mjs` 配置，素材名称为本轮暂定展示名。

| 原图 | 文件前缀 | 展示名 | 运行文件 |
| --- | --- | --- | --- |
| 微信图片_20261103205504_30977_18.png | osmanthus | 桂花披风 | osmanthus-640.webp (73140 B)、osmanthus-320.webp (24398 B) |
| 微信图片_20261103205507_30978_18.png | peach | 桃花披风 | peach-640.webp (66706 B)、peach-320.webp (21978 B) |
| 微信图片_20261103205508_30979_18.png | bamboo | 竹影披风 | bamboo-640.webp (69506 B)、bamboo-320.webp (22564 B) |
| 微信图片_20261103205509_30980_18.png | sakura | 樱花披风 | sakura-640.webp (82826 B)、sakura-320.webp (26494 B) |
| 微信图片_20261103205530_30982_18.png | scholar | 江南书生 | scholar-640.webp (69148 B)、scholar-320.webp (22688 B) |
| 微信图片_20261103205953_30983_18.png | moon | 月白花嫁 | moon-640.webp (60854 B)、moon-320.webp (21094 B) |
| 微信图片_20261103205959_30984_18.png | jade | 青蛇仙子 | jade-640.webp (68530 B)、jade-320.webp (24030 B) |
| 微信图片_20261103210105_30985_18.png | pilgrim | 小小行者 | pilgrim-640.webp (72264 B)、pilgrim-320.webp (23754 B) |

## 完整去背景提示词

各次均以表中对应原图为 `referenced_image_paths`，`transparent_background: true`。提示词记录如下，原生成输出路径和校验和保存在机器报告对应项。

```text
Use case: background-extraction. Asset type: exact transparent web character cutout. Edit target: the provided source image. Remove ONLY the pink background and floor/contact shadow, replacing them with real fully transparent alpha. Preserve this exact existing felt baby oriole character pixel-faithfully: same large black eyes/highlights, beak, yellow body, green wings, facial expression, pose, all clothing, floral embroidery, ribbons, hair, leaf crown, shoes/feet and held props. Do not redesign, redraw, restyle or simplify the bird or garment; no added or missing accessories. Retain delicate fuzzy wool silhouette and translucent fabric edges. Keep the complete full-body front view intact with 3% transparent margin on all sides, including every tall staff/hat and wide veil/skirt. Preserve original proportions, colors, lighting and material. No scenery, no floor, no shadow, no replacement solid color, no checkerboard baked into pixels, no text or watermark. Output the same single source character isolated on genuine transparent background.
```

## 复核

前后对比：`output/wardrobe-skins/assets-before-after.png`；浏览器试穿和小窝截图：`output/wardrobe-skins/screenshots/`。原始粉色背景被移除，白色绒毛与浅色衣服保留。8 套主图均已在浏览器解码并通过试穿、兑换、穿戴与刷新回归；原件和生成 PNG 不随发布包提供。
