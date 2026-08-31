# dsh-tavily

English | [中文](README.md)

**A persistent plugin that replaces the official DSH (DeepSeek Harness) web search with Tavily.**

The model's `web_search` tool stops calling the built-in search provider and goes through the [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search.md) instead.

- **Instant toggle** — a "Tavily search" card under Settings → Plugins → Plugin configuration; turning it off falls back to the official search immediately, no restart needed.
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

> **DSH version compatibility**: the plugin's client side depends on `@deepseek-ai/dsh-client-store` (settings-card rendering via `createSnapshotStore`), which matches the DSH ≥ 0.1.2-alpha.2 (DSH Desktop 2.0.4) client structure. Older runtimes lack this package and use the removed `dsh-client-runtime`; the settings card cannot render there.

## How replacement works

`ctx.web` resolves the search provider at call time via `WebRuntime.searchProviderId` (configured id wins, otherwise the single usable provider runs). This plugin:

1. registers a provider `{ id: 'dsh-tavily' }` through the public seam API;
2. redefines that instance field as a reversible accessor — reads yield `'dsh-tavily'` while the switch is on and at least one key is usable, otherwise the untouched baseline (undefined or `$DSH_WEB_SEARCH_PROVIDER`);
3. keeps `available()` consistent with the same condition, so even if a future runtime ignores the field, auto-selection degrades to the official provider instead of reporting ambiguity.

## Data locations

Keys/stats live in `<profile>/dsh-tavily.json` (user-owned, survives upgrades/uninstall); the toggle and search parameters live in the global settings document (`~/.dsh/settings.yaml`, section `dsh-tavily`). Full keys never cross HTTP responses — the UI only sees masked forms like `tvly-…xxxx`.

See the Chinese README for scheduling rules, FAQ, and development notes.
