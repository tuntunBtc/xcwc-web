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

## 商城 V1.0

商城通过现有 shop 路由接入，共用“小窝、城市、打卡、商城、我的”底栏，不提供认领页导航或入口。`/?page=shop` 可直达。源码位于 `src/shop/`：`products.js` 集中配置演示商品与淘宝地址，`template.html`、`shop.css`、`shop.js` 分别负责结构、隔离样式和交互，`assets/` 保存定稿 WebP。

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

小窝使用真实领养名单、钱包和抚摸服务；换装进入公共衣橱。合照工具每次捕获当前实体 birdId，正式打卡验证后仅选中这只，允许手动追加至 3 只；底栏通用打卡入口不沿用该上下文。无效实体不自动替换，返回保留当前小鸟和树屋场景。

登录回跳支持 home/city/photo/shop/profile/wardrobe 白名单，兼容 checkin。会话仍使用项目原有 sessionStorage，凭证不传入沙盒。账号切换、退出和 401 会清理个人缓存并取消旧请求。

城市只接展示、真实绑定名单和导航；鸟蛋资格、持久化解锁缺少后端时显示“状态待接”，不默认赠送杭州。小窝养成数值、喂食、添水、清洁、签到、改名接口也未伪造成功。

综合验收脚本为 `scripts/verify-integrated-pages.cjs`，只连接专用本地 fixture；`scripts/verify-responsive-pages.cjs` 用独立浏览器上下文检查 320/390/430/1024 宽度。连续模拟 resize 时观察到 iframe 点击命中异常，未将这种失败当作通过；各尺寸独立上下文点击检查通过。真实旋转、调整窗口及微信仍需真机复核。

本轮改动、规则冲突和待接项见 [任务记录](../docs/tasks/页面整合-V1.1030-2026-10-30.md)。已运行的隔离联调预览为 http://127.0.0.1:8767/?page=home ，不代表生产发布。
