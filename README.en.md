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

`ctx.web` resolves the search provider at call time via `WebRuntime.searchProviderId` (configured id wins, otherwise the single usable provider runs). This plugin:

1. registers a provider `{ id: 'dsh-tavily' }` through the public seam API;
2. redefines that instance field as a reversible accessor — reads yield `'dsh-tavily'` while the switch is on and at least one key is usable, otherwise the untouched baseline (undefined or `$DSH_WEB_SEARCH_PROVIDER`);
3. keeps `available()` consistent with the same condition, so even if a future runtime ignores the field, auto-selection degrades to the official provider instead of reporting ambiguity.

## Data locations

Keys, stats, the toggle and the search parameters all live in `<profile>/dsh-tavily.json` (user-owned, survives upgrades/uninstall; the host entry config — `config:` on our profile-patch row — only seeds the first run). Full keys never cross HTTP responses — the UI only sees masked forms like `tvly-…xxxx`.

## Authentication

The card's HTTP endpoints are registered as **exact routes under `/api/dsh-tavily/...`**, never as a prefix route of their own. The webServer dispatches by exact path → longest prefix → fallback, and a deployment's auth gate sits on the *empty* prefix — the weakest slot — so a plugin-declared prefix would outrank it and serve anonymous callers. That holds even for a nested prefix such as `/api/dsh-tavily`: gates own the `/api` prefix plus the **exact** routes beneath it (re-scanned, so late registrations are caught), while a plugin prefix wins longest-prefix dispatch before the gate is ever consulted. With exact routes these endpoints inherit exactly the same admission policy as the rest of the WebUI API: password session cookie, or the loopback host-direct exemption a desktop shell relies on. Deployments with no auth plugin stay as open as before.

See the Chinese README for scheduling rules, FAQ, and development notes.
