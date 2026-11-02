# xcwc-web

卜叽岛小鸟伙伴前端项目。打卡合照已接入真实登录、领养与账号叽分 API；小窝与城市定稿已接入，缺少服务的能力明确显示待接。

## 构建与预览

需要 Python 3；使用 npm 命令时还需本机安装 Node.js。前端构建无需安装 npm 依赖。

```sh
npm run build
npm run preview
```

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

`scripts/verify-reference.cjs` 为现行界面浏览器验收脚本，需要额外可用的 Playwright 和 Chrome，并先启动预览。截图默认保存到 `output/screenshots/`，可用 `BJD_SCREENSHOT_DIR` 覆盖；`verify-room.cjs` 是上一版喂养界面的验收记录。

## 页面共用尺寸与风格

小窝、城市、商城、我的以及 NFC 领养深链页共用同一全屏页面壳：手机视口宽度自适应、最大内容宽 480px，底栏高 72px 并适配安全区，页面内容区独立滚动。共用底栏为“小窝、城市、商城、我的”；打卡页面沿用原实现，仍由小窝右侧入口进入。页面继续保留各自已确认的主视觉，统一底色、苔绿强调色、导航尺寸、卡片圆角与外层滚动规则。

## 商城 V1.0

商城通过现有 shop 路由接入，共用“小窝、城市、商城、我的”底栏；打卡统一从小窝页面右侧的“合照打卡”入口进入，不提供认领页导航或入口。`/?page=shop` 可直达。源码位于 `src/shop/`：`products.js` 集中配置演示商品与淘宝地址，`template.html`、`shop.css`、`shop.js` 分别负责结构、隔离样式和交互，`assets/` 保存定稿 WebP。

商城采用 Shadow DOM 隔离定稿样式，复用现有路由；购物车由宿主按匿名/用户名分别存入 localStorage，保存稳定商品 ID 并去重，不代表已下单，不跨设备同步。购买路径为加购、购物车、去淘宝购买；宿主校验 HTTPS 淘宝域名后以 noopener/noreferrer 在新窗口打开。微信内是否唤起淘宝仍由容器决定；跳转后保留购物车，不自动发蛋。旧混用演示购物车不迁入账号，不自动合并匿名与登录购物车。

演示价格销量沿用定稿，不产生站内支付、订单或鸟蛋发放。商品图中的权益文案为定稿素材，具体领取方式待后续定义。未迁移源预览站点的 manifest 或托管身份。

商城验收：`scripts/verify-shop.cjs` 使用 Playwright 与本机 Chrome，可用 `PLAYWRIGHT_MODULE` 指定额外安装路径，`XCWC_PREVIEW_URL` 指定预览地址。已验证城市筛选、排序、详情、加购、去重、刷新持久化、移除/空状态、320/390/660 宽度和跨页面导航，未出现页面脚本错误；淘宝导航在测试中拦截验证 URL，不实际购买。预览可通过 `PORT=8776 npm run preview` 启动，访问 `http://127.0.0.1:8776/?page=shop`。

## 打卡合照

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
