# xcwc-web

卜叽岛小鸟伙伴前端项目。当前第一期为免登录本机体验：实体资料与商城从后端读取，领取、养成、叽分、装扮和合照保存在当前浏览器。云端账号接口独立保留，不作为本期领取前置条件，不自动合并本机与云端数据。

## 构建与预览

需要 Python 3 和 Node.js；构建使用 Python 标准库及仓库内的图标资料，不需要安装 npm 依赖。部署后的静态站点不需要 Node.js。

```sh
npm run build
npm run preview
```

2026-11-04 性能拆包后，页面脚本和样式位于 `dist/runtime/`，图片采用内容指纹并保留旧 URL。新素材更新时执行 `npm run media:sync-shop` 同步后端商城 URL，然后构建、检查并配套发布前后端。必须上传完整 `dist/`，不能仅替换两个 HTML；服务器保留旧指纹资源以兼容已打开的网页。实现与冷／热缓存边界见 [IP 性能验收记录](../docs/tasks/IP访问性能优化-V1.1030-2026-11-04.md)。

访问 http://127.0.0.1:8766/。也可以直接运行 `python3 scripts/build-room.py` 构建。

## 目录

- `src/nest/`、`src/city/`：2026-10-30 定稿页面，以 Shadow DOM 隔离样式。
- `src/account-client.js`、`src/account-host.js`、`src/account-pages.*`：公共账号桥接、钱包、切鸟和衣橱。
- `src/reference-pages.js`、`src/reference-pages.css`：历史原型与导航兼容代码，新页面由集成脚本适配。
- `src/room.js`、`src/room.css`：喂养、摸头、添水等交互。
- `src/frame.html`、`src/shell.html`：原始页面及沙盒外壳模板。
- `assets/`：项目图片及生成说明。
- `vendor/`：已内联使用的第三方前端库。
- `scripts/build-room.py`、`scripts/integrate-pages.py`：构建及页面适配脚本。
- `dist/`：完整构建产物（含账号页面及公共素材），部署时必须整体复制。
- `.openai/hosting.json`：原 Sites 项目标识，迁移后保留以便更新同一站点。

修改源码后重新构建，不直接编辑 `dist/index.html`。原有 Git 历史随目录一同保留。

2026-11-03 已清理无构建、运行或测试引用的原始 HTML 快照、旧领养页草稿及旧商城示意图。正式领养继续使用 `src/adopt/v1/`，编码解析使用 `src/adopt/entry.mjs`；旧派生图的生成任务和资源记录同步退役。清理范围、验证及恢复入口见 [前端清理记录](../docs/tasks/前端无用文件清理-V1.1030-2026-11-03.md)。

## 媒体优化与发布检查

统一规则见 [媒体资源与性能规范](../docs/MEDIA-PERFORMANCE.md) 和本工程 `AGENTS.md`。现有原件保留，网页通过构建映射使用 `assets/optimized/` 中带内容指纹的派生资源；商城继续复用其裁切专用清单。

```sh
npm run media:optimize
npm run build
npm run media:check
```

仅生成／复核派生图需要 Pillow（`python3 -m pip install Pillow`）；正常构建和发布检查只用 Python 标准库，不新增前端运行依赖。优化后提交 `config/media-derivatives.json` 与对应派生文件。商城图变更使用 `node scripts/optimize-shop-images.cjs`，按其输出清单更新商品配置后再构建。

`config/media-runtime.json` 声明动态表情、皮肤和接口商品图片，以及保留原因明确的兼容文件；新增动态路径需要同步清单。构建只发布实际静态引用和这些动态资源，排除制作原图、编辑记录及系统杂项。缺失资源、源文件漂移、错误映射和未经审核的超额文件会阻止构建；预算例外绑定当前文件大小和 SHA-256。`dist/media-manifest.json` 是发布文件校验清单，检查结果保存在 `output/media-optimization/asset-check.json`。

图片复核：`python3 scripts/optimize-media.py --check`。门禁回归：`python3 -m unittest discover -s tests -p 'test_media_pipeline.py'`。浏览器对比脚本为 `scripts/verify-media-performance.cjs`，需先准备相同真实隔离接口支持的优化前／后快照，参数见脚本；不连接生产写接口。

`scripts/verify-reference.cjs` 为现行界面浏览器验收脚本，需要额外可用的 Playwright 和 Chrome，并先启动预览。截图默认保存到 `output/screenshots/`，可用 `BJD_SCREENSHOT_DIR` 覆盖；`verify-room.cjs` 是上一版喂养界面的验收记录。

## 当前主流程验收

当前第一期采用展会 B 档快速演示，默认约 1～2 分钟出现饥渴，心情按分钟变化；普通节奏保留为独立配置。具体参数与旧缓存迁移规则见需求基线最新章节。

完整浏览器验收使用 `scripts/verify-fullflow-audit.cjs`，设置 `XCWC_PREVIEW_URL` 为本次隔离预览根地址、`XCWC_TEST_BIRD_CODES` 为两只真实隔离建档实体码（逗号分隔）。`XCWC_FREEZE_CLOCK=1` 可固定时钟验证一般交互，真实演示时序另由 `verify-exhibition-profile.cjs` 控时验证。存储故障、跨标签reset、旧相册迁移和图片按需读取分别有专项脚本，范围与报告见 [全项目审查记录](../docs/tasks/全项目审查与主流程回归-V1.1030-2026-11-03.md)。并发验收须用独立报告标签或目录，不能覆盖其他聊天的报告再当作本轮证据。

下面历史实施章节的旧 verify-guest-flow、verify-checkin、verify-integrated-pages 等脚本保留用于追溯，部分仍基于已替代的登录、测试淘宝链接和普通养成节奏，不作为当前版本验收入口。正式外部领取地址始终为 `/register.html?birdCode=完整编码`，根路径带码只作兼容。

## 页面共用尺寸与风格

小窝、城市、商城、我的以及 NFC 领养深链页共用同一全屏页面壳：手机视口宽度自适应、最大内容宽 480px，底栏高 72px 并适配安全区，页面内容区独立滚动。共用底栏为“小窝、城市、商城、我的”；打卡页面沿用原实现，仍由小窝右侧入口进入。页面继续保留各自已确认的主视觉，统一底色、苔绿强调色、导航尺寸、卡片圆角与外层滚动规则。

## 商城 V1.0

商城通过现有 shop 路由接入，共用“小窝、城市、商城、我的”底栏；打卡统一从小窝页面右侧的“合照打卡”入口进入，不提供认领页导航或入口。`/?page=shop` 可直达。源码位于 `src/shop/`：`products.js` 保存分页与轮播设置，`template.html`、`shop.css`、`shop.js` 分别负责结构、隔离样式和交互。商品列表、详情、轮播由 `/api/shop/` 只读接口提供；商品与媒体清单维护在 `../xcwc-api/src/main/resources/shop/catalog.json`，字段说明见 [商品清单维护](../xcwc-api/SHOP-CATALOG.md)。

商城采用 Shadow DOM 隔离定稿样式，复用现有路由。购物车由宿主按匿名/用户名隔离，稳定商品 ID 的读取、去重、增删和 100 件上限均在同一个 IndexedDB 事务中处理，避免标签页互相覆盖；旧 `xcwc.shop.cart.v1:*` 记录首次读取时迁入，localStorage 继续保留兼容镜像。数据库为 `xcwc.shop.coordination.v1`，`mutex` store 同时保存购物车与重置代次；“清除缓存”通过已授权的共享 hook 一并清理，并拒绝重置前的排队加购。购物车只在本机保存，不代表已下单，不跨设备同步。购买路径为加购、购物车、去淘宝购买；宿主校验 HTTPS 淘宝域名后以 noopener/noreferrer 在新窗口打开。微信内是否唤起淘宝仍由容器决定；跳转后保留购物车，不自动发蛋。旧混用演示购物车不迁入账号，不自动合并匿名与登录购物车。购买链接为空时禁用购买入口。

演示价格销量沿用定稿，不产生站内支付、订单或鸟蛋发放。商品图中的权益文案为定稿素材，具体领取方式待后续定义。未迁移源预览站点的 manifest 或托管身份。

商城验收使用 `scripts/verify-shop-api.cjs`、`scripts/verify-shop-cart-tabs.cjs`、`scripts/verify-shop-cart-lifecycle.cjs` 和 `scripts/verify-shop-performance.cjs`，覆盖真实本机接口、全部配置商品与详情图、购物车并发和图片请求；使用 Playwright 的 Chromium/WebKit，可通过 `PLAYWRIGHT_MODULE` 和 `XCWC_PREVIEW_URL` 指定依赖与本地地址。清缓存回归另运行 `node --test tests/local-data-reset.test.mjs`。列表使用 480 px WebP 封面，首两张优先加载、其余懒加载；完整详情仅在打开时读取。媒体统计与复现见 [商城图片优化](assets/shop/media-optimization.md)。预览可通过 `PORT=8776 npm run preview` 启动，并按服务约定配置 API 代理；当前独立联调预览为 `http://127.0.0.1:8814/?page=shop`。

## 打卡合照

2026-11-03 最新交互：当前本机主流程统一使用宿主合照查看器，生成并收藏后直接展示，预览和相册点击复用；已移除“保存原图”和旧 iframe 大图弹窗。保存按钮直接调用系统菜单（HTTP 使用 HTTPS 平面保存页兼容），长按图片及折叠文件下载作为备用。照片不上传云端，导出不再创建作品或发分；本地打卡相册与系统照片相册分开。说明与验收见 [任务记录](../docs/tasks/打卡查看与保存交互简化-V1.1030-2026-11-03.md)。以下旧服务端联调记录用于历史追溯。

沿用 `photo` 路由，`/?page=photo` 可直达。设计基线保持在 `../docs/design-baselines/checkin-v1.0/`，集成源码为 `src/checkin-*`。最多选择 3 只真实已领养实体，支持独立移动、缩放和风格调整；服务端保存成功后奖励 1 叽分，相册按创建时间倒排。

本地联调需运行 xcwc-api，再启动同源代理：

```sh
npm run build
API_TARGET=http://127.0.0.1:8080 npm run preview
```

未配置 API_TARGET 时接口返回服务不可用，不生成演示余额或作品。登录使用现有 `/register.html` 与 sessionStorage 会话；沙盒内通过受限父页面桥接访问 API，不接收 token。照片需登录读取，不能作为公共静态资源发布。

验证：`node --test tests/checkin-model.test.mjs`；浏览器脚本 `scripts/verify-checkin.cjs` 仅用于隔离的本地测试库，需要 Playwright、Chrome 和专用 fixture，不能指向生产。部署及接口说明见 `../docs/CHECKIN-IMPLEMENTATION.md`。

## 小窝与城市接入

小窝使用真实领养名单、钱包和抚摸服务；换装进入公共衣橱。右侧“合照打卡”工具每次捕获当前实体 birdId，正式打卡验证后仅选中这只，允许手动追加至 3 只。无效实体不自动替换，返回保留当前小鸟和树屋场景。

登录回跳支持 home/city/photo/shop/profile/wardrobe 白名单，兼容 checkin。会话仍使用项目原有 sessionStorage，凭证不传入沙盒。账号切换、退出和 401 会清理个人缓存并取消旧请求。

城市只接展示、真实绑定名单和导航；鸟蛋资格、持久化解锁缺少后端时显示“状态待接”，不默认赠送杭州。小窝养成数值、喂食、添水、清洁、签到、改名接口也未伪造成功。

综合验收脚本为 `scripts/verify-integrated-pages.cjs`，只连接专用本地 fixture；`scripts/verify-responsive-pages.cjs` 用独立浏览器上下文检查 320/390/430/1024 宽度。连续模拟 resize 时观察到 iframe 点击命中异常，未将这种失败当作通过；各尺寸独立上下文点击检查通过。真实旋转、调整窗口及微信仍需真机复核。

本轮改动、规则冲突和待接项见 [任务记录](../docs/tasks/页面整合-V1.1030-2026-10-30.md)。已运行的隔离联调预览为 http://127.0.0.1:8767/?page=home ，不代表生产发布。

## NFC 碰一碰领养页 V1.0（2026-11-01）

外部深链 `/?birdCode=<完整实体编码>` 自动进入领养路由，也可使用 `/?page=adopt&birdCode=<完整实体编码>`；`bird=<旧版内部实体 ID>` 仅为兼容入口。页面不进入常驻导航，继续复用“小窝、城市、商城、我的”四项导航、原账号会话和受控父页 API 桥接。实现位于 `src/adopt/v1/`；原定稿图保留在交接包，正式 H5 使用其无字派生底图 `assets/adopt-v1/nfc-adoption-v1-background.png`，资料、性格占位、昵称和按钮为动态 DOM。昵称草稿只保留在页面内存，不写浏览器持久存储。

游客进入时先查公开资料，再自动显示可关闭的登录框；登录复用账号接口并回到同一实体页面，保留昵称。仅识别服务返回的实体资料；已查到本人绑定时禁用重复提交。性格字段暂缺时显示“资料待接入”。点击“孵化并领养”通过桥接明确返回未开放，不创建绑定、不发鸟蛋、不展示成功，也不调用旧 `/claim`。名称支持 1–6 个 Unicode 字符及随机建议。

后端仍只有旧隐藏码、单 owner 认领契约。完整 NFC 编码解析与有效性识别、多账号实体绑定和幂等、本人绑定关系查询、鸟蛋权益及孵化阶段查询均待新增/调整 API；现有 `/birds/{id}` 只可查询 32 位 hex 内部 ID 的公开资料。故该页面目前是已接入正式 H5 的界面与旧公开资料读取路径，完整领养尚未上线。

验证：`npm run build`、`node --test tests/adoption-entry.test.mjs`、`node scripts/verify-adoption-v1.cjs`。浏览器验收脚本使用 Playwright、本地 Chrome 和 API fixture，不访问真实账号或数据库；覆盖 NFC 深链、登录回跳/昵称、账号切换、本人已绑定、超长字段、错误和不支持编码、无旧 claim 请求、返回小窝及四项导航在 320/390/430/1024 px 的回归。截图在 `output/adoption-v1/screenshots/`。本地预览：`http://127.0.0.1:8767/?birdCode=<32位hex内部编号>`；未配置/未运行对应 API 时，页面显示明确资料不可用状态。

任务记录见 [NFC 领养页 V1.0 接入](../docs/tasks/nfc-adoption-v1.0-2026-11-01.md)。

### 三段式公开编码查询接入（2026-11-01）

本轮已支持 城市-IP CODE-雪花ID 输入，调用 GET /api/birds/by-code/{birdCode}，以返回的内部 id 执行个人资源查询。保留旧 32 位 hex 查询。该修订仅补齐上文“完整 NFC 编码解析”的缺口，多账号绑定、发蛋、孵化仍未开放。前缀不用于前端自行推断资料或发放权益；验证见 tests/adoption-entry.test.mjs 和后端 BirdCodeTest。

## 第一期免登录本机体验（2026-11-02）

最新范围见 ../docs/tasks/前端接口接入-本机体验-V1.1030-2026-11-02.md。当前主流程公开查询实体后免登录领取；小鸟、养成、叽分使用独立 localStorage，本机合照使用 IndexedDB，不写云端账号资产。清除缓存或换设备不会恢复。

运行 `npm run build`，使用 `API_TARGET=http://127.0.0.1:18088 PORT=8786 npm run preview` 对接本轮隔离后端；正式环境按实际 API 地址配置，不能将本轮测试码用于正式出货。进入 `/?birdCode=后端已建档完整编码`。验收命令为 `XCWC_PREVIEW_URL=http://127.0.0.1:8786 XCWC_TEST_BIRD_CODE=已建档测试编码 node scripts/verify-guest-flow.cjs`，需要 Playwright 与本机 Chrome。

### 云端兼容能力修复（2026-11-02）

保留一期免登录本机主流程。云端账号模块已补充统一持久会话存储（固定七天、退出/过期清理、不存密码）、服务端 session 校验和 adopt 幂等桥接；这些能力不将本机领取改为强制登录，也不把本地钱包上传云端。旧章节中 sessionStorage、单 owner、隐藏码和孵化未开放等描述为历史状态，当前后端能力见 ../xcwc-api/README.md。云端合照反馈按实际 reward=0/1，WELCOME 流水显示初见礼。

本轮最新源码在临时副本构建通过，26 项 Node 测试通过；浏览器完成真实公开资料查询、本机领取、刷新后恢复且初见礼不重复。没有执行生产发布。详细云端修复与验证边界见 ../docs/tasks/领养登录与奖励矛盾修复-V1.1030-2026-11-02.md。

## 固定领取地址

对外使用 `/register.html?birdCode=完整编码`，直接加载领取页且不改地址栏。根路径带码只保留兼容；旧账号登录入口为 account.html。此前已生成的部署包未自动更新，需重建前端包并覆盖站点文件。


## 换装衣橱（2026-11-03）

「我的 → 我的衣橱」和「小窝 → 换装」共用正式 `wardrobe` 路由。衣橱沿用本机叽分和受控桥接：湖蓝／落日光晕分别 30／70 叽分永久解锁，本机小鸟共享解锁、穿戴逐鸟保存。提供兑换确认、余额不足、原貌恢复和光晕预览；兑换后选择穿戴，不自动扣分重买。背景与卡片为毛毡风，界面文字和状态均为动态控件。

源码为 `src/account-pages.js`、`src/wardrobe-felt.css`；独立场景素材及生成提示词见 `assets/wardrobe/felt/README.md`。正式构建自动加载，无须另外复制演示页面。验证运行 `node scripts/verify-wardrobe-felt.cjs` 和 `node scripts/verify-wardrobe-review.cjs`（需要本机 Chrome 与 Playwright，可设置 `PLAYWRIGHT_MODULE`、`XCWC_PREVIEW_URL`）。审查记录见 [换装页毛毡风格](../docs/tasks/换装页毛毡风格-V1.1030-2026-11-03.md)。本机数据不跨设备同步，未发布服务器。


### 小黄莺真实服装

新增 `小鸟资料库/皮肤` 提供的 8 套小黄莺服装，卡片可直接试穿（不扣叽分、不改保存记录），兑换后穿戴。统一目录为 `src/wardrobe-catalog.mjs`；四款花叶披风暂定 30 叽分、四款主题服装暂定 70 叽分，名称和价格可在该目录调整。既有光晕和权益保留。小窝、头像和个人资料跟随已保存的穿戴；穿着服装时保留静态服装造型与动作／声音反馈，恢复原貌后仍有原有七种表情。

皮肤原图不直接发布，运行衍生资源为 `assets/wardrobe/huangying/` 下的 640／320 WebP；素材处理记录与原文件映射保存在同目录。额外浏览器验收：`node scripts/verify-wardrobe-skins.cjs`，详见 [皮肤上架记录](../docs/tasks/小黄莺皮肤上架-V1.1030-2026-11-03.md)。
