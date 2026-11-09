# 公共底栏毛绒素材衍生声明

本目录保存导航素材的用途、可见范围审计与可复现裁切声明，不覆盖用户 PNG 原件。网页使用 `/assets/navigation/plush/*.webp` 虚拟别名，统一媒体流水线将其映射为 `assets/optimized/navigation/plush/` 内带内容指纹的实际文件。

## 来源与可见范围

原件目录：`assets/导航栏/xcwc-ui-assets/`；仅使用 `nav-background.png` 和 `nav-icons/` 的 8 张图片。喂食、添水、摸摸素材本轮不接入。

- 底板原始 2172 × 724，但 alpha ≥4 的主体范围仅 `(25,139)–(2145,551)`。按整画布显示会让上下透明空白占位过高。
- 图标原始 1254 × 1254；alpha 1–3 的极低透明噪点遍布整个画布，不能用 alpha >0 直接决定可见框。alpha ≥4 与 ≥8、≥12 的边界接近，故以 ≥4 测量主体，再向外保留 12 个源像素绒毛余量。
- default／active 两张采用主体联合框，并扩为同一个正方形；两状态的裁切位置、缩放和 128 × 128 输出画布完全相同。只对 bounds 判断忽略极低透明噪点，最终裁切内部 RGBA 不做去背、锐化或手绘修改。
- 背景独立等比缩放至 960 × 195（比例四舍五入误差 <0.2%），适合 375–430 px 手机约 2.2–2.6 倍分辨率。历史 lossless WebP 为 195,880 B；2026-11-05 从原 PNG 按原裁切／尺寸生成 q94 WebP，运行图 69,012 B，PSNR 42.68 dB，alpha 逐像素相同。历史文件保留。

| 用途 | 源裁切框 `[left,top,right,bottom]` | 输出尺寸 |
| --- | --- | --- |
| 毛绒底板及两端花叶 | `[13,127,2157,563]` | 960 × 195 |
| 小窝，两状态共用 | `[159,159,1089,1089]` | 128 × 128 |
| 城市，两状态共用 | `[128,138,1110,1120]` | 128 × 128 |
| 商城，两状态共用 | `[115,124,1121,1130]` | 128 × 128 |
| 我的，两状态共用 | `[155,153,1079,1077]` | 128 × 128 |

9 张原件共 8,006,613 字节。逐文件源路径、SHA-256、体积、alpha 阈值边界在 [source-audit.json](source-audit.json)；实际运行文件、输出 SHA-256 和体积见 [runtime-report.json](runtime-report.json)，并以 `config/media-derivatives.json` 的 `usageDerivatives` 为准。原件、候选 jobs 和审计文件均不进入发布包。

## 重现

```sh
python3 scripts/prepare-nav-plush.py
```

将 `usage-jobs.json` 中的 `nav-plush-*` 声明合并到现有 `config/media-usage.json`，保留其他用途。之后运行项目既有入口，不另起编码流程：

```sh
npm run media:optimize
npm run build
npm run media:check
python3 scripts/optimize-media.py --usage-only --check
```

`prepare-nav-plush.py` 只重新测量 PNG 并写出声明／审计；实际裁切、LANCZOS 缩放及编码由既有 `scripts/optimize-media.py` 执行；8 张图标仍无损逐像素检查，底板按 q94、>=40 dB 和完全相同 alpha 检查。源 PNG 从不修改，不把制作资料或本目录审计当作网页图片加载。
