# dsh-tavily

[English](README.en.md) | 中文

**用 Tavily 替换 DeepSeek Harness（DSH）官方网页搜索的持久化插件。**

模型的 `web_search` 工具不再调用 DSH 内置的搜索提供方，而是改走 [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search.md)。支持：

- **随时开关**：在 设置 → 插件 的「Tavily 网页搜索」页面一键切换（官方 ≥ 0.2.0 是「内置插件」里的一个标签页，旧版宿主是「插件配置」里的折叠卡片）；关闭后立即回落到官方搜索，无需重启。
- **多 API Key 池**：添加任意多个 Tavily Key，分别查看每个 Key 的用量统计与余额。
- **余额优先轮流**：自动按剩余额度排序，额度多的先用；剩余额度并列的密钥轮流使用。
- **手动顺序**：也可切换为按自定义顺序从上到下使用。
- **失败自动切换（failover）**：某把钥匙鉴权失败 / 额度用尽 / 限流时自动换下一把；硬失败会进入 5 分钟冷却（429 限流冷却 30 秒），沉到队尾。
- **用量统计**：本地记录每个 Key 的调用数、成功/失败、积分消耗、最近错误与耗时；并可一键从 Tavily 官方 Usage 端点刷新真实余额。

零依赖、纯 JS、无构建步骤。

## 安装 / 卸载

```sh
# 使用者：从 npm 安装（推荐）
npx @deepseek-ai/dsh plugin --profile web add @yuuz12/dsh-tavily

# 维护者 / 本地开发（link 模式，改源码后重启 DSH 即生效）
npx @deepseek-ai/dsh plugin --profile web add D:/Project/dsh-tavily

# 使用者：从 GitHub 或 tarball
npx @deepseek-ai/dsh plugin --profile web add github:Yuuz12/dsh-tavily
npx @deepseek-ai/dsh plugin --profile web add ./yuuz12-dsh-tavily-0.2.0.tgz   # npm pack 产物

# 卸载
npx @deepseek-ai/dsh plugin --profile web remove @yuuz12/dsh-tavily
```

安装后**重启 DSH** 生效。目标 profile 若已装过旧版，先 `remove` 再 `add`。

> **关于 DSH 版本兼容**：client 端只使用平台自带模块（`react`、`@deepseek-ai/dsh-client-store`——都属于客户端静态种子表），插件自身零 import，因此不受 `@deepseek-ai/*` 版本漂移影响。
>
> **官方打包版（DSH Desktop / dsh-desktop ≥ 0.2.0）适配**：客户端模块必须以**包名**（`@yuuz12/dsh-tavily`）注册——boot graph 的 entry id 取自 package.json 的 `name`，写成短名会让 web boot 判定该条目 import 失败；同时 0.2.0 移除了 `ctx.settings.register()` 命名空间 API，开关与搜索参数改由插件自己的数据文件持有（见下方「数据存储位置」）。

## 使用

官方 ≥ 0.2.0：打开 **设置 → 插件**，切到「Tavily 网页搜索」标签页（与内置「插件清单」标签页并列）。
旧版宿主：打开 **设置 → 插件 → 插件配置**，展开「Tavily 网页搜索」卡片。

使用步骤：

1. 粘贴一个或多个 Tavily API Key（在 [app.tavily.com](https://app.tavily.com) 免费注册即得，每把每月 1000 积分），点击**添加密钥**。
2. 点击密钥区右上角**刷新全部用量**拉取每个 Key 的官方余额数据。
3. 打开顶部的**替换官方网页搜索**开关——状态行显示「已接管网页搜索」即生效。

卡片内还可调整：多密钥策略（余额优先 / 手动顺序）、搜索深度（basic=1 积分、advanced=2 积分、fast、ultra-fast）、单次结果上限（1–20）、类别（general/news/finance）、AI 摘要回答（include_answer）。

### 多密钥调度规则

| 场景 | 行为 |
|---|---|
| 余额优先（默认） | 剩余积分多的先用；无限额度的计划最优先；从未刷新过用量的 Key 排在已知余额之后作兜底；**头部并列的密钥按请求次数轮流** |
| 手动顺序 | 严格按列表自上而下（▲▼ 可调序），不做轮转 |
| 失败切换 | 任一密钥出错即尝试下一把；全部失败才向模型报错 |
| 冷却 | 401/403（鉴权失败）、432/433（超额）→ 5 分钟；429（限流）→ 30 秒；冷却中的密钥沉底但不会拒绝参与 failover |

每次成功调用的积分消耗（来自 Tavily 响应的 `usage.credits`）会即时累加到缓存的已用量上，让余额排序在不刷新的情况下也保持准确。

## 数据存储位置

| 安装方式 | 密钥 / 统计 / 开关与搜索参数的位置 |
|---|---|
| link 本地目录 / junction | 插件目录下 `dsh-tavily.json`（见下方回退说明） |
| npm / GitHub / tgz | `<profile>/dsh-tavily.json`（用户数据，随 profile 持久） |

- 配置与密钥同在一份 `dsh-tavily.json`：`config` 节存开关与搜索参数，宿主条目配置（profile patch 里本行的 `config:`）只在首次运行时作为播种值。
- 密钥**只存本机**，绝不随 HTTP 响应返回完整内容（界面仅见 `tvly-…xxxx` 脱敏形式）。
- 升级 / 重装插件不会丢失密钥、统计与开关；卸载插件也不会删除该文件，可手动备份或删除。
- 若插件目录被非常规加载（无法推导 profile 目录），数据文件会回退写到插件目录下的 `dsh-tavily.json`（已在 `.gitignore` 排除）。

### 与部署级认证的关系（安全）

DSH 的 webServer 按「exact 路径 → 最长前缀 → fallback」派发，而认证闸门注册在**空前缀**（`path: ''`）——那是这个顺序里最弱的一档。插件若自建根级前缀（例如 `/dsh-tavily`），就会排在闸门之前，匿名请求直接落到插件自己的 handler，等于在 WebUI 的认证边界上开了一个洞。

所以本插件的每个端点都注册为 **`/api/dsh-tavily/...` 下的 exact 路由**（`/api/dsh-tavily`、`/state`、`/config`、`/keys`、`/keys/update`、`/keys/move`、`/keys/test`、`/keys/remove`、`/usage/refresh`）：

- `/api` 是部署级认证（如 [`dsh-webui-auth`](https://github.com/Yuuz12/dsh-webui-auth)）必然接管的前缀，它连同**该前缀下的 exact 路由**一起包装（2 秒重扫，能捕获晚注册的路由），因此每个请求都先经过部署自己的准入判定：口令会话 Cookie，或该部署为桌面端保留的回环「宿主直连」豁免；
- **必须是 exact 路由，不能是前缀路由**：闸门只认 `/api` 这一个前缀键，插件自己声明的前缀（哪怕嵌在 `/api/dsh-tavily` 之下）会在最长前缀派发里胜出，从而绕过闸门——这一点踩过一次，`index.js` 的 `transport placement` 注释里留了记录；
- 准入策略因此与 WebUI 其余 API **完全一致**，不需要插件重复实现一套——也就不会因版本演进而失配（此前那套「探测 `sessions.jsonl` 自行校验」的自守卫，在 `link:` 安装下推不出 profile 目录，会静默失效；即便生效，它读到的也是未随浏览器会话滑动的过期时间，会误伤正常会话）；
- 浏览器同源请求自动携带 Cookie，使用上无感知；未安装认证插件的纯回环部署维持原样（不额外设限）。

> 用反向代理 / 隧道把 WebUI 暴露到本机之外时，请确认部署装了认证插件：只依赖内核 BrowserAuth 的部署不会自动覆盖第三方插件的路由。

## 工作原理（替换机制）

DSH 的网页搜索走 `ctx.web` 能力缝，提供方在**每次调用时**解析。不同版本解析的地方不一样，本插件对两种都做了适配：

1. 通过公开 API `ctx.web.registerSearchProvider()` 注册 id 为 `dsh-tavily` 的搜索提供方；
2. **DSH ≥ 0.2.x（当前）**：运行时从 `@deepseek-ai/dsh-web` 这一行组合出的 `searchProvider` 配置里取提供方（官方 base 层默认钉死 `deepseek-official`）。插件通过 `ctx.configEditor.edit()` 把 `searchProvider` 写成 `dsh-tavily`，写入落在当前 profile 的 `cordis.patch.yml` 并立即热生效；关闭开关时把**写入前的有效配置**原样还原（若还原值等于继承值，整行配置会被移除）。写入前会记下原值，进程重启后继续有效，不需要重新点开关。
   - 写入必须从**请求上下文**发起：插件激活本身处在 profile 重载的 HMR 事务里，而 `configEditor` 要开自己的独占事务，嵌套会被拒绝（`HMR transactions cannot be nested`）。所以面板打开时会调用一次 `POST /api/dsh-tavily/takeover` 补齐；`/state` 里的 `routing.pending` 标记这种"开关开着但还没接管"的中间态。
3. **DSH ≤ 0.1.x（旧版）**：运行时读可变的 `web.searchProviderId` 字段，插件把它重定义为可逆 accessor，开关开启且有可用密钥时读取值为 `dsh-tavily`，否则透传原基线值；插件卸载时摘除 accessor 并还原原始属性描述符。
4. `available()` 与接管条件保持一致，因此即使没有任何接管接口，自动选择也会优雅回落到官方提供方而不是报歧义错误；此时 `routing.mode` 为 `none`，面板会直接说明当前 DSH 版本无法自动切换。

Tavily 响应按 `ctx.web` 词汇投影：`results[]` → `sources[]`（url/title/snippet/publishedAt），`answer` → `content`。`max_results` 取工具请求与面板上限的较小值。

## 常见问题

- **开关开着但状态行说「接管尚未生效」？** 看 `GET /api/dsh-tavily/state` 的 `routing`：`mode` 是 `none` 表示当前 DSH 没有可用的接管接口（把 `web` 行的 `searchProvider` 手动设为 `dsh-tavily`）；`pending: true` 表示还没写进去，打开面板或调一次 `POST /api/dsh-tavily/takeover` 即可补齐。
- **没配 DeepSeek Key 的部署能用吗？** 能。此时本插件往往是唯一可用提供方，即使不依赖接管也能被自动选中。
- **测试按钮会花钱吗？** 会发起一次真实的 basic 搜索，消耗 1 积分。
- **多个 DSH profile 共享开关吗？** 不共享：开关、密钥池、统计都在该 profile（或插件目录）的 `dsh-tavily.json` 里，各 profile 彼此独立；接管写在本 profile 的 `cordis.patch.yml`。
- **卸载前要做什么？** 先把开关关掉再卸载/禁用插件：关闭会把 `web` 行还原。插件如果被直接卸载，留在 patch 里的 `searchProvider: dsh-tavily` 会指向一个不存在的提供方，搜索会报 `WEB_PROVIDER_CONFIGURED_MISSING` —— 手动删掉 `cordis.patch.yml` 里那行 `- id: web` 的 `config` 即可恢复。

## 开发与自检

```sh
node --check index.js && node --check lib/client.js   # 语法
node .scratch/selftest.mjs                            # 34 例离线自检（纯函数 + mock ctx 集成 + client 包契约）
```

自检覆盖：配置归一化、密钥排序（余额/手动/冷却/轮转）、seam 响应映射、HTTP 路由表、注册与卸载还原、选择语义（含歧义防御）、failover 与积分记账、配置落盘与回滚、脱敏、持久化往返，以及 client 包的注册 id / slot 注册 / 卡片渲染契约。

## License

MIT
