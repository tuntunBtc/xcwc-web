# 城市页毛绒视觉素材

2026-11-02，依据用户确认的城市页整体截图、列表框架和六城卡片参考，用内置 image_gen 制作无字场景。用户原稿保存在 docs/design-baselines/city-felt-v1-2026-11-02；原始生成 PNG 保留在 Codex generated_images，不打入网页。

- hero-960.webp：960 × 720，西湖毛绒场景与右侧躺卧小黄莺，左侧预留动态文案区域；包含插画，不含昵称、叽分、标题、控件或进度。
- cities-1200.webp：1200 × 800，无间隙 3×2 景观图集。顺序为杭州、苏州、南京、上海、西安、武汉，各格 400×400。用 CSS background-size:300% 200% 与对应 background-position 取格。
- 其它毛绒面板与公共导航复用 assets/nest/felt，不重复生成或覆盖原件。城市名称、状态、数值、简介及按钮全部为 DOM。

压缩命令：node scripts/prepare-city-felt.cjs；SHARP_MODULE 可指定已安装的 sharp 模块，CITY_IMAGE_SOURCE 可指定原始生成图片目录。WebP 使用有损压缩，约 400 KiB 合计，报告见 report.json。原素材不覆盖。

生成工具：内置 image_gen。完整提示词见 prompts.json。
