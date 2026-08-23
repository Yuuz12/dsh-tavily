# dsh-tavily

[English](README.en.md) | 中文

**用 Tavily 替换 DeepSeek Harness（DSH）官方网页搜索的持久化插件。**

模型的 `web_search` 工具不再调用 DSH 内置的搜索提供方，而是改走 [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search.md)。支持：

- **随时开关**：在 设置 → 插件 → **插件配置** 的「Tavily 搜索」卡片里一键切换；关闭后立即回落到官方搜索，无需重启。
- **多 API Key 池**：添加任意多个 Tavily Key，分别查看每个 Key 的用量统计与余额。
- **余额优先轮流**：自动按剩余额度排序，额度多的先用；剩余额度并列的密钥轮流使用。
- **手动顺序**：也可切换为按自定义顺序从上到下使用。
- **失败自动切换（failover）**：某把钥匙鉴权失败 / 额度用尽 / 限流时自动换下一把；硬失败会进入 5 分钟冷却（429 限流冷却 30 秒），沉到队尾。
- **用量统计**：本地记录每个 Key 的调用数、成功/失败、积分消耗、最近错误与耗时；并可一键从 Tavily 官方 Usage 端点刷新真实余额。

零依赖、纯 JS、无构建步骤。

## 安装 / 卸载

```sh
# 维护者 / 本地开发（link 模式，改源码后重启 DSH 即生效）
npx @deepseek-ai/dsh plugin --profile web add D:/Project/dsh-tavily

# 使用者：从 GitHub 或 tarball
npx @deepseek-ai/dsh plugin --profile web add github:<user>/dsh-tavily
npx @deepseek-ai/dsh plugin --profile web add ./dsh-tavily-0.1.0.tgz   # pnpm pack 产物

# 卸载
npx @deepseek-ai/dsh plugin --profile web remove dsh-tavily
```

安装后**重启 DSH** 生效。目标 profile 若已装过旧版，先 `remove` 再 `add`。

## 使用

打开 **设置 → 插件 → 插件配置**，展开「Tavily 网页搜索」卡片（与内置「终端」「Agent 循环」「网页搜索」卡片并列）。

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

| 安装方式 | 密钥/统计数据位置 | 开关与搜索参数位置 |
|---|---|---|
| link 本地目录 | `<profile>/dsh-tavily.json`（用户数据，随 profile 持久） | DSH 全局设置文档（`~/.dsh/settings.yaml` 的 `dsh-tavily` 节） |
| GitHub / tgz / npm | 同上（`<profile>` 为插件所装 profile 目录） | 同上 |

- 密钥**只存本机**，绝不随 HTTP 响应返回完整内容（界面仅见 `tvly-…xxxx` 脱敏形式）。
- 升级 / 重装插件不会丢失密钥与统计；卸载插件也不会删除该文件，可手动备份或删除。
- 若插件目录被非常规加载（无法推导 profile 目录），数据文件会回退写到插件目录下的 `dsh-tavily.json`（已在 `.gitignore` 排除）。

### 与 dsh-webui-auth 的集成（安全）

DSH 的 webServer 按最长前缀派发路由，任何插件自定义前缀都会绕过网关级的统一认证前缀（如 [`dsh-webui-auth`](https://github.com/Yuuz12/dsh-webui-auth) 守护的 `/api`、`/plugins`）。本插件对此做了自守卫：

- 启动时按以下顺序探测 dsh-webui-auth 的会话存储 `sessions.jsonl`：环境变量 `DSH_WEBUI_AUTH_DATA_DIR` → `<profile>/node_modules/dsh-webui-auth/` → `$DSH_HOME/dsh-webui-auth/` → 插件目录同级；
- **一旦找到**，`/dsh-tavily/*` 全部端点要求有效的 `dsh_wua_session` 会话 Cookie（JSONL 重放校验，登出 / 改密撤销即时生效；浏览器同源请求自动携带，无感知）；
- **未找到**（纯回环部署、未装认证插件）则保持开放。

日志中会出现「已启用 dsh-webui-auth 会话校验」一行表明守卫生效。

## 工作原理（替换机制）

DSH 的网页搜索走 `ctx.web` 能力缝：工具层每次执行时由 `WebRuntime` 解析搜索提供方——若配置了 `searchProviderId` 就用它，否则在"恰好只有一个可用提供方"时自动选择。本插件：

1. 通过公开 API `ctx.web.registerSearchProvider()` 注册 id 为 `dsh-tavily` 的搜索提供方；
2. 将实例字段 `searchProviderId` 重定义为可逆 accessor：开关开启且有可用密钥时读取值为 `dsh-tavily`，否则透传原基线值（未配置为 undefined；若设置了 `$DSH_WEB_SEARCH_PROVIDER` 环境变量则尊重之）。外部写入会更新基线；插件卸载时摘除 accessor 并还原原始属性描述符；
3. `available()` 与接管条件保持一致，因此即使未来版本不再读取该字段，自动选择也会优雅回落到官方提供方而不是报歧义错误。

Tavily 响应按 `ctx.web` 词汇投影：`results[]` → `sources[]`（url/title/snippet/publishedAt），`answer` → `content`。`max_results` 取工具请求与面板上限的较小值。

## 常见问题

- **开启后报 `WEB_PROVIDER_AMBIGUOUS`？** 说明当前运行时没有应用路由接管（见工作原理第 2 步的防御路径）。请反馈你的 DSH 版本；临时方案是关闭开关回到官方搜索。
- **没配 DeepSeek Key 的部署能用吗？** 能。此时本插件往往是唯一可用提供方，即使不依赖路由接管也能被自动选中。
- **测试按钮会花钱吗？** 会发起一次真实的 basic 搜索，消耗 1 积分。
- **多个 DSH profile 共享开关吗？** 开关存在全局 settings 文档里（跨 profile 共享）；密钥池按 profile 隔离。

## 开发与自检

```sh
node --check index.js && node --check lib/client.js   # 语法
node .scratch/selftest.mjs                            # 26 例离线自检（纯函数 + mock ctx 集成）
```

自检覆盖：配置归一化、密钥排序（余额/手动/冷却/轮转）、seam 响应映射、HTTP 路由表、注册与卸载还原、选择语义（含歧义防御）、failover 与积分记账、脱敏、持久化往返。

## License

MIT
