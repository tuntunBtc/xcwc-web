# 毛绒领养页素材

使用内置 imagegen，依据用户 2026-11-02 两张参考图制作无字素材。文字、实体编号、领取状态由 DOM 呈现；不烘焙测试款式或测试编号。原图留在生成目录，不复制进发布包。

## adopt-felt-scene

原始生成文件：`/Users/beluga/.codex/generated_images/01a19a2c-5a54-7951-a14e-34ea814ceecb/exec-21ff54d1-d235-4bdb-bffc-588b5d10774e.png`

```text
Use case: precise-object-edit. Asset type: exact unlettered website illustration plate. Edit target: attached adoption UI reference. Reproduce ONLY its UPPER SCENE, ending immediately below the trait pills and immediately ABOVE the large identity panel. Output landscape 4:3 (1024x768). Preserve that upper reference composition exactly, fluffy felt wool texture, pastel willow branches and blue West Lake pagoda background, warm felt tree at right with the pink orange tassel lantern; happy yellow baby oriole with leaf crown, green wings, ivory belly, blushing smiling face and upraised wings in blue pagoda-painted ivory cracked eggshell on LEFT at x12%-61%, y41%-89%; hanging pale peach felt identity card at RIGHT x66%-96%, y37%-84%, tiny corner flowers; blank cloud title panel centered x29%-70%, y9%-33%; small fluffy back circle at x3%-12% y2%-14%; small dark brown status capsule x33%-68%, y2%-8%; bottom trait row: small fluffy label disk x5%-18% y87%-99% then three pale peach felt capsules x22%-43%,47%-68%,72%-94% y90%-99%, keep their little leaf/camera/sparkle icons at left. REMOVE every Chinese word, every letter, every number, title text, status text, card text, trait text, back arrow; leave empty clean surfaces for HTML labels. No identity/details lower panel, no naming form, no navigation. Do not add any new design elements. Keep all existing textures and bird identity. Camera front-facing mobile UI illustration flat plate, same soft sunlight and reference colors. No text anywhere, no watermark.
```

## adopt-felt-panel

原始生成文件：`/Users/beluga/.codex/generated_images/01a19a2c-5a54-7951-a14e-34ea814ceecb/exec-7c31e9bd-8685-486a-8bdd-5c9f0d116378.png`

```text
Use case: background-extraction. Asset type: transparent reusable UI panel background. Input image is the exact style/design reference. Extract/recreate just ONE of its large pale peach ivory fluffy wool rectangular panels, front-facing flat horizontal panel, aspect ratio 2:1, isolated on genuinely transparent background. Same softly irregular furry rounded corners and short curly pale peach ivory wool fibers as reference. Nearly full frame with 3% transparent margin. Keep tiny pink/yellow/white felt flower and green leaf decorations at top left and top right only, directly matching reference panel corners. Center surface completely blank and uniform to place actual HTML text, inputs and buttons on. NO text, NO separators, NO badges, NO input box, NO green button, NO birds, NO mushrooms, NO shadows extending far outside silhouette. Exact reference material/colors; not a smooth vector rounded rectangle, no borders. High fidelity wispy furry silhouette. Output only single reusable blank panel, wide landscape.
```

## adopt-felt-button

原始生成文件：`/Users/beluga/.codex/generated_images/01a19a2c-5a54-7951-a14e-34ea814ceecb/exec-7440f3e0-4859-4d85-90ba-77e0b36b61f7.png`

```text
Use case: background-extraction. Asset type: transparent UI button background. Extract/recreate exactly the GREEN GRASSY WOOL BUTTON from lower naming form of reference: wide horizontal pill, approx aspect ratio 4:1, rich moss green center and pale yellow lime wool fluffy furry thick rim, tiny ivory five-petal flowers and green leaves near upper left edge and pink flower near upper right edge, same reference handmade plush felt/fiber texture and soft sunlight. Fully blank center without any Chinese words, arrow, text, digits, or symbols. Isolated on genuinely transparent background, no surrounding card/grass/scenery. Keep 4% transparent space around fuzzy perimeter. Single front facing button asset, wide landscape. Do not invent extra elements.
```

## adopt-felt-meadow

原始生成文件：`/Users/beluga/.codex/generated_images/01a19a2c-5a54-7951-a14e-34ea814ceecb/exec-8abc0387-45a4-4411-84d2-b53504bfa489.png`

```text
Use case: precise-object-edit. Asset type: blank lower page background matching the supplied adoption UI reference. Edit reference is the attached felt adoption page. Recreate only the lower grassy meadow background seen AROUND its lower cards and bottom navigation, removing ALL cards, all panels, all navigation, all buttons, all text, all birds, no lake or sky. A front-facing softly lit field of tiny moss green curly plush wool grass with sparse tiny pink, white, yellow felt daisies mostly close to left/right outside edges and lower corners, same pale peach and moss green color and fuzzy textile style from reference. Center mostly quiet green meadow texture, moderate fine detail at website size. No large mushrooms, no new objects, no tree, no branches. Important: isotropic short curled fibers and small leaves, never vertically stretched grass strands. Portrait 2:3 seamless-looking natural meadow backdrop, from foreground bottom to slightly softer midground top. Exact reference soft sunlight. No letters, numbers, labels, watermarks or UI.
```

## 顶部状态底条清理（2026-11-04，仅本地待确认）

- 保留原 `scene-900.webp`；新 `status-cleanup-324.webp` 为 324×68 透明 WebP 补片，约 28 KB，覆盖原场景像素区域 x=280、y=4。CSS 使用同一 900×675 场景坐标比例，10 px 透明渐变边缘，仅用于领养页首屏。
- 使用内置 imagegen；生成原稿归档于 `小鸟资料库/领养页状态条清理-2026-11-04/scene-clean-generated.png`，完整提示及验证见对应任务记录。只取原稿的状态条局部修复区域，不用生成稿替换整张场景，保留区域外原图。
- 运行补片由 Sharp 缩放、裁取和渐变透明后无损 WebP 保存。统一 `media:optimize` 审核登记，无重复有损压缩；首屏加载，尺寸和 SHA-256 见 `config/media-derivatives.json`。归档原稿不进入发布包。

## 用户指定新主视觉（2026-11-04 追加，仅本地待确认）

- 原件：`小鸟资料库/领养页主视觉替换-2026-11-04/user-scene.png`，来自用户本轮图一，1448×1086，2,319,442 字节；原件留档不发布。
- 当前运行图：`scene-v2-900.webp`，900×675，140,834 字节，SHA-256 `3e18a732c6cdd61db92525a9ed1d6f395c4283799ed7d23221f3dcee7c5d199e`。
- Sharp 按原比例缩至 900 px、WebP quality 92，无裁切、重绘或生成式修改；统一 media:optimize 登记。原始 SHA、尺寸和转换记录见 `output/adoption-scene-v2-preview/asset.json`。
- 首屏沿用 fetchpriority=high、明确宽高及 4:3 容器；新图没有旧棕色状态条，清理补片已退出 DOM，历史文件保留。左上返回按钮用 CSS 奶油色圆底保持可见与 ≥44 px 点击区。
- 新图替换只作用于领养主视觉，下方表单与公共导航未改；构建和本地验证见领养页信息精简任务的追加记录。

### 返回按钮取消（用户后续纠正）

用户明确要求与新原图一致，不添加左上角返回按钮；已删除额外补充的按钮 DOM、圆底、箭头与点击处理。上文“补 CSS 返回圆底”方案作废，不重新生成或重绘背景。追加附件原件保存为 `小鸟资料库/领养页主视觉替换-2026-11-04/user-scene-confirmed.png`。

## 用户指定下部背景（2026-11-05，本地预览）

- 原件：`小鸟资料库/领养页下部背景-2026-11-05/user-lower-scene.png`，852×1846，2,578,470 字节，SHA-256 `4de8b323781378153ecc8829f40595c852f112156ee19131e57a1a7a5f520c3a`。原件归档，不进入运行包。
- 运行图：`lower-scene-720.webp`，720×1560，241,002 字节，SHA-256 `baed513b022e6d72ddb6cfcb83ab6d9a457ffa475d97c5c26b76bc8d4aff93f2`。从原 PNG 等比缩放，WebP quality 92，不裁切、不重绘、不重复有损压缩；统一优化器已审核。
- 仅用于领养页 `.adoption-details`。图片按 6:13 原比例显示，明确宽高、异步解码、随视口加载；真实表单叠放在中下部留白，避开上部小鸟与花枝，不把输入或按钮烘焙进图。
- 顶部原图、文案、导航及其他页面不属于本轮变更；未发布线上。转换记录见 `output/adoption-lower-art-20261105/asset.json`。

用户后续标红要求删除下部图中的花树与小鸟重复场景。运行图文件不变，当前用 CSS 裁去顶部 630 px（以 720×1560 图坐标计），显示剩余绿色留白和底部花朵；不改变剩余图片缩放或压缩。表单同步上移，其他内容保持，验证见 `output/adoption-remove-scene-20261105/`。
