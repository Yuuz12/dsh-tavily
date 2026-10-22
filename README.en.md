# dsh-tavily

English | [中文](README.md)

**A persistent plugin that replaces the official DSH (DeepSeek Harness) web search with Tavily.**

The model's `web_search` tool stops calling the built-in search provider and goes through the [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search.md) instead.

- **Instant toggle** — a "Tavily web search" page under Settings → Plugins (a tab inside "Built-in plugins" on DSH ≥ 0.2.0, a collapsible card under "Plugin configuration" on older hosts); turning it off falls back to the official search immediately, no restart needed.
- **Multi-key pool** — add any number of Tavily API keys and inspect per-key usage stats and balances.
- **Balance-first rotation** — keys with more remaining credits go first; tied leaders rotate request by request. A manual fixed order is also available.
- **Failover** — auth failures, exhausted quotas, or rate limits roll over to the next key; hard failures cool a key down for 5 minutes (429 for 30s).
- **Usage stats** — local counters (requests, successes, failures, credits, last error/latency) plus one-click balance refresh from Tavily's Usage endpoint.

Zero dependencies, plain JS, no build step.

## Install

```sh
# users: from npm (recommended)
npx @deepseek-ai/dsh plugin --profile web add @yuuz12/dsh-tavily
# maintainer / local dev (link mode)
npx @deepseek-ai/dsh plugin --profile web add D:/Project/dsh-tavily
# users: GitHub or tarball
npx @deepseek-ai/dsh plugin --profile web add github:Yuuz12/dsh-tavily
# uninstall
npx @deepseek-ai/dsh plugin --profile web remove @yuuz12/dsh-tavily
```

Restart DSH afterwards. If an older copy exists in the profile, `remove` before `add`.

> **DSH version compatibility**: the client half only uses platform-provided modules (`react`, `@deepseek-ai/dsh-client-store` — both part of the client static seed table) and the plugin itself has zero imports, so `@deepseek-ai/*` version drift cannot break it.
>
> **Officially packaged builds (DSH Desktop / dsh-desktop ≥ 0.2.0)**: the client module must register under its **package name** (`@yuuz12/dsh-tavily`) — the boot graph's entry id comes from `name` in package.json, and a short id makes web boot report the entry as "import failed". 0.2.0 also removed the `ctx.settings.register()` namespace API, so the toggle and search parameters now live in the plugin's own data file (see "Data locations").

## How replacement works

`ctx.web` resolves the search provider on every call, and where it reads the choice from differs by DSH version. Both shapes are supported:

1. the provider `{ id: 'dsh-tavily' }` registers through the public seam API;
2. **DSH ≥ 0.2.x (current)**: the service reads the `searchProvider` config composed for its own `@deepseek-ai/dsh-web` Loader row (the official base layer pins `deepseek-official`). The plugin writes `searchProvider: dsh-tavily` through `ctx.configEditor.edit()`, which lands in the active profile's `cordis.patch.yml` and hot-applies. Turning the switch off restores the effective config captured just before the write (and the row is dropped entirely when that value equals the inherited one). The captured value survives restarts, so the pin stays valid.
   - The write must originate in a **request context**: activation itself runs inside the profile reload's HMR transaction and `configEditor` opens its own exclusive one, so a nested call is rejected (`HMR transactions cannot be nested`). Opening the panel therefore calls `POST /api/dsh-tavily/takeover` once to repair the gap that `routing.pending` reports.
3. **DSH ≤ 0.1.x (legacy)**: the runtime read a mutable `web.searchProviderId`, which this plugin redefines as a reversible accessor while the switch is on.
4. `available()` matches the same condition, so a build with no takeover surface degrades to the official provider instead of reporting ambiguity; `routing.mode` is then `none`.

## Data locations

Keys, stats, the toggle and the search parameters all live in `<profile>/dsh-tavily.json` (user-owned, survives upgrades/uninstall; the host entry config — `config:` on our profile-patch row — only seeds the first run). Full keys never cross HTTP responses — the UI only sees masked forms like `tvly-…xxxx`.

## Authentication

The card's HTTP endpoints are registered as **exact routes under `/api/dsh-tavily/...`**, never as a prefix route of their own. The webServer dispatches by exact path → longest prefix → fallback, and a deployment's auth gate sits on the *empty* prefix — the weakest slot — so a plugin-declared prefix would outrank it and serve anonymous callers. That holds even for a nested prefix such as `/api/dsh-tavily`: gates own the `/api` prefix plus the **exact** routes beneath it (re-scanned, so late registrations are caught), while a plugin prefix wins longest-prefix dispatch before the gate is ever consulted. With exact routes these endpoints inherit exactly the same admission policy as the rest of the WebUI API: password session cookie, or the loopback host-direct exemption a desktop shell relies on. Deployments with no auth plugin stay as open as before.

> Uninstall note: turn the switch off before removing the plugin. The off switch restores the `web` row; a plugin removed while it still owns the pin leaves `searchProvider: dsh-tavily` behind, and searches fail with `WEB_PROVIDER_CONFIGURED_MISSING` until you delete that `config:` block from the profile's `cordis.patch.yml`.

See the Chinese README for scheduling rules, FAQ, and development notes.
