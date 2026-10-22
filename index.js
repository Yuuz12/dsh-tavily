/**
 * dsh-tavily — persistent Tavily search plugin for DeepSeek Harness.
 *
 * Replaces the official web search (`web_search` tool backend, `ctx.web`) with
 * a Tavily-backed search provider. Zero-dependency by design: no imports, so
 * installation is a plain folder plus one cordis.patch.yml row and module
 * resolution can never break against a moving @deepseek-ai/* tree.
 *
 * How replacement works (see README for the full story):
 * - A search provider `{ id: 'dsh-tavily', available(), search() }` registers
 *   through the public seam API `ctx.web.registerSearchProvider()`.
 * - The seam resolves the provider at call time. Two runtime shapes are supported:
 *   DSH ≤ 0.1.x read a mutable `web.searchProviderId`, so we redefine that field as
 *   an accessor (legacy mode); DSH ≥ 0.2.x removed it and reads the composed
 *   `searchProvider` config of its `web` Loader row, so we pin that value through
 *   `ctx.configEditor` while the switch is ON and restore the previous effective
 *   config when it goes OFF (config mode). Either way the override is reversible.
 * - `available()` mirrors the switch, so even a deployment that pins nothing never
 *   reports ambiguity; it simply keeps serving the official provider.
 *
 * Configuration surfaces:
 * - The browser card (`lib/client.js`) registers itself as a tab on the official
 *   plugins page (DSH ≥ 0.2.0 list slot `settings.plugins.tab`) and, on hosts
 *   that still declare it, as a keyed card in the legacy `settings.plugin.item`
 *   slot. The plugin owns its own storage, so neither slot is a hard dependency.
 * - Same-origin HTTP endpoints under `/api/dsh-tavily/*` serve the card: config,
 *   key pool, per-key usage stats, ordering, tests, and live balance refreshes.
 *   The `/api` mount is deliberate: that surface is what a deployment's auth gate
 *   owns, so these endpoints inherit the same admission policy as the rest of the
 *   WebUI API instead of escaping it as a longer root-level prefix would.
 *
 * Data: config / keys / stats / balance cache persist to `<profile>/dsh-tavily.json`
 * (user-owned, survives upgrades). The cordis entry config (the profile patch's
 * `config:` block for our row) only seeds the first run: DSH ≥ 0.2.0 dropped the
 * namespace-based `ctx.settings.register()` API, so card writes land in that file.
 * Secrets never ride HTTP responses — the UI only ever sees masked keys.
 */

export const name = 'dsh-tavily'

export const inject = ['web', 'webServer', 'fs']

//#region constants -----------------------------------------------------------------

/** Provider id inside `ctx.web`. Unique against 'deepseek-official' etc. */
const PROVIDER_ID = 'dsh-tavily'

/** HTTP mount (exact routes only: `${HTTP_PREFIX}` plus the paths below). */
const HTTP_PREFIX = '/api/dsh-tavily'

/**
 * Every endpoint this plugin serves, registered as its own EXACT route. Keep this in
 * sync with `pickRoute` and with the client's `api()` calls: a path missing here is a
 * path the plugin does not serve at all.
 */
const HTTP_ROUTES = Object.freeze([
  HTTP_PREFIX,
  `${HTTP_PREFIX}/state`,
  `${HTTP_PREFIX}/config`,
  `${HTTP_PREFIX}/takeover`,
  `${HTTP_PREFIX}/keys`,
  `${HTTP_PREFIX}/keys/update`,
  `${HTTP_PREFIX}/keys/move`,
  `${HTTP_PREFIX}/keys/test`,
  `${HTTP_PREFIX}/keys/remove`,
  `${HTTP_PREFIX}/usage/refresh`,
])

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
const TAVILY_USAGE_URL = 'https://api.tavily.com/usage'
const USER_AGENT = 'dsh-tavily/0.2.0 (deepseek-harness plugin)'

/** Hard cap on one provider attempt; the cooperative tool budget still applies. */
const ATTEMPT_TIMEOUT_MS = 25_000
/** Hard cap on one usage (balance) fetch. */
const USAGE_TIMEOUT_MS = 12_000
/** Auth/quota failures park a key at the tail of the rotation for this long. */
const KEY_COOLDOWN_MS = 5 * 60_000
/** Rate-limit (429) cooldowns are much shorter. */
const RATE_COOLDOWN_MS = 30_000
/** Balance cache TTL used to decide whether the UI shows stale data. */
const USAGE_STALE_MS = 60_000

const SEARCH_DEPTHS = ['basic', 'advanced', 'fast', 'ultra-fast']
const TOPICS = ['general', 'news', 'finance']
const STRATEGIES = ['balance', 'manual']

/** Unknown balance ranks below every known value: known budgets lead, unrefreshed keys fall back. */
const UNKNOWN_BALANCE_RANK = -Infinity

const CONFIG_DEFAULTS = Object.freeze({
  enabled: false,
  strategy: 'balance',
  searchDepth: 'basic',
  maxResults: 8,
  topic: 'general',
  includeAnswer: false,
})

//#endregion

//#region tiny utils -----------------------------------------------------------------

function nowIso() {
  return new Date().toISOString()
}

function genId(prefix) {
  try {
    return prefix + '_' + crypto.randomUUID().slice(0, 8)
  } catch {
    return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  }
}

/** Mask an API key for display: keep the scheme prefix and the last 4 chars. */
function maskKey(key) {
  const k = String(key ?? '')
  if (k.length <= 10) return '••••'
  const dash = k.indexOf('-')
  const head = dash > 0 ? k.slice(0, dash + 1) : k.slice(0, 3)
  return `${head}…${k.slice(-4)}`
}

/**
 * The module's own directory, derived from import.meta.url (pure string ops).
 */
function pluginDir() {
  try {
    let url = import.meta.url
    const q = url.indexOf('?')
    if (q !== -1) url = url.slice(0, q)
    const h = url.indexOf('#')
    if (h !== -1) url = url.slice(0, h)
    if (url.startsWith('file://')) {
      let p = url.slice('file://'.length)
      if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1) // Windows: '/C:/...' -> 'C:/...'
      p = decodeURIComponent(p)
      const slash = p.lastIndexOf('/')
      if (slash > 0) return p.slice(0, slash)
    }
  } catch (e) { /* fall through */ }
  return null
}

/**
 * The hosting profile directory ($DSH_HOME/profiles/<name>). User data lives
 * HERE rather than in the package folder: content-addressed installs replace
 * package files on upgrade, while the profile directory is user-owned.
 */
function profileDirOf() {
  const dir = pluginDir()
  if (!dir) return null
  const marker = '/profiles/'
  const idx = dir.replaceAll('\\', '/').indexOf(marker)
  if (idx === -1) return null
  const rest = dir.replaceAll('\\', '/').slice(idx + marker.length)
  const slash = rest.indexOf('/')
  return slash === -1 ? dir : dir.slice(0, idx + marker.length + slash)
}

//#endregion

//#region config normalization -------------------------------------------------------

/**
 * Total-function normalization of one raw config section. Unknown shapes collapse
 * to defaults and invalid fields snap back instead of throwing, so a hand-edited
 * data file or entry config can never brick plugin startup.
 */
function normalizeConfig(raw) {
  const v = (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : CONFIG_DEFAULTS.enabled,
    strategy: STRATEGIES.includes(v.strategy) ? v.strategy : CONFIG_DEFAULTS.strategy,
    searchDepth: SEARCH_DEPTHS.includes(v.searchDepth) ? v.searchDepth : CONFIG_DEFAULTS.searchDepth,
    maxResults: Number.isInteger(v.maxResults) && v.maxResults >= 1 && v.maxResults <= 20 ? v.maxResults : CONFIG_DEFAULTS.maxResults,
    topic: TOPICS.includes(v.topic) ? v.topic : CONFIG_DEFAULTS.topic,
    includeAnswer: typeof v.includeAnswer === 'boolean' ? v.includeAnswer : CONFIG_DEFAULTS.includeAnswer,
  }
}

//#endregion

//#region persisted state (config / keys / stats / balance cache) ---------------------

function emptyStats() {
  return { requests: 0, success: 0, failed: 0, creditsUsed: 0, lastUsedAt: null, lastError: null }
}

/**
 * Durable bookkeeping for the config-mode takeover: `pinnedByUs` says whether this
 * plugin wrote `web.searchProvider`, `savedConfig` keeps the effective config from
 * just before that write so turning the switch off restores it exactly.
 */
function emptyTakeover() {
  return { pinnedByUs: false, savedConfig: null }
}

/**
 * The Loader row that owns `ctx.web`. Row ids vary by composition, so match the
 * package name; `ctx.configEditor` only accepts entries it can address in the
 * profile patch, which is exactly this row in the shipped compositions.
 */
function findWebEntry(ctx) {
  try {
    const loader = typeof ctx.get === 'function' ? ctx.get('loader') : undefined
    if (!loader || typeof loader.entries !== 'function') return null
    const rows = [...loader.entries()].filter((entry) => entry && entry.options && entry.options.name === '@deepseek-ai/dsh-web')
    if (rows.length === 0) return null
    return rows.find((entry) => entry.options.id === 'web') || rows[0]
  } catch (e) {
    return null
  }
}

function sanitizeData(raw) {
  const src = (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}
  // `config: null` marks a document without a config section (fresh install or a
  // file written by an older version) — `apply` seeds it from the entry config.
  const out = { config: null, keys: [], order: [], stats: {}, usageCache: {}, takeover: emptyTakeover() }
  if (src.config !== undefined && src.config !== null) out.config = normalizeConfig(src.config)
  if (src.takeover && typeof src.takeover === 'object' && !Array.isArray(src.takeover)) {
    out.takeover.pinnedByUs = src.takeover.pinnedByUs === true
    if (src.takeover.savedConfig && typeof src.takeover.savedConfig === 'object' && !Array.isArray(src.takeover.savedConfig)) {
      out.takeover.savedConfig = { ...src.takeover.savedConfig }
    }
  }
  const seen = new Set()
  if (Array.isArray(src.keys)) {
    for (const entry of src.keys) {
      if (!entry || typeof entry !== 'object') continue
      if (typeof entry.id !== 'string' || entry.id.length === 0) continue
      if (typeof entry.key !== 'string' || entry.key.trim().length === 0) continue
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      out.keys.push({
        id: entry.id,
        key: entry.key,
        label: typeof entry.label === 'string' ? entry.label : '',
        addedAt: typeof entry.addedAt === 'string' ? entry.addedAt : nowIso(),
        disabled: entry.disabled === true,
      })
    }
  }
  if (Array.isArray(src.order)) {
    for (const id of src.order) if (typeof id === 'string' && seen.has(id) && !out.order.includes(id)) out.order.push(id)
  }
  for (const k of out.keys) if (!out.order.includes(k.id)) out.order.push(k.id)

  const grabStats = (v) => {
    const s = emptyStats()
    if (!v || typeof v !== 'object') return s
    s.requests = Number.isInteger(v.requests) && v.requests >= 0 ? v.requests : 0
    s.success = Number.isInteger(v.success) && v.success >= 0 ? v.success : 0
    s.failed = Number.isInteger(v.failed) && v.failed >= 0 ? v.failed : 0
    s.creditsUsed = Number.isFinite(v.creditsUsed) && v.creditsUsed >= 0 ? v.creditsUsed : 0
    s.lastUsedAt = typeof v.lastUsedAt === 'string' ? v.lastUsedAt : null
    s.lastError = typeof v.lastError === 'string' ? v.lastError : null
    return s
  }
  if (src.stats && typeof src.stats === 'object') {
    for (const k of out.keys) if (src.stats[k.id]) out.stats[k.id] = grabStats(src.stats[k.id])
  }
  if (src.usageCache && typeof src.usageCache === 'object') {
    for (const k of out.keys) {
      const u = src.usageCache[k.id]
      if (!u || typeof u !== 'object') continue
      out.usageCache[k.id] = {
        fetchedAt: typeof u.fetchedAt === 'string' ? u.fetchedAt : null,
        plan: typeof u.plan === 'string' ? u.plan : null,
        usage: Number.isFinite(u.usage) && u.usage >= 0 ? u.usage : null,
        limit: u.limit === null || u.limit === undefined || u.limit === Infinity ? null : (Number.isFinite(u.limit) && u.limit >= 0 ? u.limit : null),
        searchUsage: Number.isFinite(u.searchUsage) && u.searchUsage >= 0 ? u.searchUsage : null,
        extractUsage: Number.isFinite(u.extractUsage) && u.extractUsage >= 0 ? u.extractUsage : null,
        planUsage: Number.isFinite(u.planUsage) && u.planUsage >= 0 ? u.planUsage : null,
        planLimit: u.planLimit === null || u.planLimit === undefined || u.planLimit === Infinity ? null : (Number.isFinite(u.planLimit) && u.planLimit >= 0 ? u.planLimit : null),
      }
    }
  }
  return out
}

async function readData(ctx, dataPath) {
  let raw = null
  try {
    const target = await ctx.fs.resolve(dataPath)
    raw = await ctx.fs.readText(target)
  } catch (e) { raw = null }
  if (!raw) return sanitizeData(null)
  try { return sanitizeData(JSON.parse(raw)) } catch { return sanitizeData(null) }
}

async function writeData(ctx, dataPath, data) {
  const target = await ctx.fs.resolve(dataPath)
  await ctx.fs.writeText(target, JSON.stringify(data, null, 2), undefined, undefined, { mode: 'danger-full-access' })
}

//#endregion

//#region key ordering engine ---------------------------------------------------------

/** Keys eligible for searching: present, non-empty, not manually disabled. */
function usableKeys(data) {
  return data.keys.filter((k) => k.disabled !== true && typeof k.key === 'string' && k.key.trim().length > 0)
}

function cooldownActive(data, keyId, nowMs) {
  const s = data.stats[keyId]
  if (!s) return false
  const until = s.cooldownUntil
  return typeof until === 'number' && nowMs < until
}

function remainingRank(data, keyId) {
  const cached = data.usageCache[keyId]
  if (!cached || cached.usage === null || cached.usage === undefined) return UNKNOWN_BALANCE_RANK
  if (cached.limit === null) return Infinity // unlimited plan always leads
  return Math.max(0, cached.limit - cached.usage)
}
/**
 * Order candidate keys for the next attempt.
 *
 * Both strategies share the same scaffolding: cooling keys sink to the tail,
 * everything else follows the strategy order, and the final sequence is what
 * `search()` walks with failover.
 *
 * - `balance`: highest remaining credit first (unlimited plans lead; unknown
 *   balances sit below known ones). Ties at the HEAD rotate round-robin via
 *   `rrCounter`, so equally-funded keys take turns.
 * - `manual`: the user's `order` array, verbatim.
 *
 * Pure: returns a new array; `rrCounter` is consumed, not mutated.
 */
function orderKeys(candidates, strategy, data, rrCounter, nowMs = Date.now()) {
  const displayIndex = new Map(data.order.map((id, i) => [id, i]))
  const decorated = candidates.map((entry, i) => {
    const cooling = cooldownActive(data, entry.id, nowMs)
    const manual = displayIndex.has(entry.id) ? displayIndex.get(entry.id) : data.order.length + i
    const remaining = remainingRank(data, entry.id)
    return { entry, i, cooling, manual, remaining }
  })

  const byStrategy = (a, b) => {
    if (a.cooling !== b.cooling) return a.cooling ? 1 : -1
    if (strategy === 'manual') return a.manual - b.manual || a.i - b.i
    // balance: descending remaining; Infinity-safe numeric compare
    if (a.remaining !== b.remaining) return a.remaining > b.remaining ? -1 : 1
    return a.manual - b.manual || a.i - b.i
  }
  decorated.sort(byStrategy)

  // Round-robin the head tie-group (only meaningful in balance mode, and only
  // when the leaders are not parked in cooldown).
  if (strategy === 'balance' && decorated.length > 1) {
    const head = decorated[0]
    let groupEnd = 1
    while (groupEnd < decorated.length) {
      const cur = decorated[groupEnd]
      if (cur.cooling !== head.cooling) break
      if (cur.remaining !== head.remaining) break
      groupEnd += 1
    }
    if (groupEnd > 1) {
      const shift = ((rrCounter % groupEnd) + groupEnd) % groupEnd
      const group = decorated.slice(0, groupEnd)
      const rotated = group.slice(shift).concat(group.slice(0, shift))
      decorated.splice(0, groupEnd, ...rotated)
    }
  }

  return decorated.map((d) => d.entry)
}

//#endregion

//#region Tavily HTTP client -----------------------------------------------------------

async function requestJson(url, init, timeoutMs, signal) {
  const signals = []
  if (signal) signals.push(signal)
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    signals.push(AbortSignal.timeout(timeoutMs))
  }
  let abortSignal
  if (signals.length === 1) abortSignal = signals[0]
  else if (signals.length > 1 && typeof AbortSignal.any === 'function') abortSignal = AbortSignal.any(signals)
  else if (signals.length > 0) abortSignal = signals[0]

  const response = await fetch(url, { ...init, ...(abortSignal ? { signal: abortSignal } : {}) })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  return { ok: response.ok, status: response.status, body, text }
}

function describeApiError(res, fallbackLabel) {
  const detail = res.body && res.body.detail
  const message = typeof detail === 'string' ? detail
    : detail && typeof detail === 'object' && typeof detail.error === 'string' ? detail.error
    : res.body && typeof res.body.error === 'string' ? res.body.error
    : `HTTP ${res.status}`
  const err = new Error(`${fallbackLabel}: ${message}`)
  err.status = res.status
  return err
}

/**
 * One Tavily search attempt. Resolves `{ data, credits }`; rejects with
 * `.status` attached for HTTP failures.
 */
async function tavilySearch({ apiKey, query, maxResults, config, signal }) {
  const body = {
    query,
    max_results: Math.max(1, Math.min(20, maxResults)),
    search_depth: config.searchDepth,
    topic: config.topic,
    include_answer: config.includeAnswer === true ? 'basic' : false,
    include_usage: true,
  }
  const res = await requestJson(TAVILY_SEARCH_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify(body),
  }, ATTEMPT_TIMEOUT_MS, signal)
  if (!res.ok) throw describeApiError(res, 'Tavily 搜索请求失败')
  const data = res.body && typeof res.body === 'object' ? res.body : {}
  const credits = data.usage && Number.isFinite(data.usage.credits) ? data.usage.credits : 0
  return { data, credits }
}

/** Fetch one key's authoritative balance from the Usage endpoint. */
async function tavilyUsage(apiKey, signal) {
  const res = await requestJson(TAVILY_USAGE_URL, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
      'user-agent': USER_AGENT,
    },
  }, USAGE_TIMEOUT_MS, signal)
  if (!res.ok) throw describeApiError(res, 'Tavily 用量查询失败')
  const body = res.body && typeof res.body === 'object' ? res.body : {}
  const keyInfo = body.key && typeof body.key === 'object' ? body.key : {}
  const account = body.account && typeof body.account === 'object' ? body.account : {}
  return {
    fetchedAt: nowIso(),
    plan: typeof account.current_plan === 'string' ? account.current_plan : null,
    usage: Number.isFinite(keyInfo.usage) ? keyInfo.usage : null,
    // 密钥级上限：普通账号常为 null（额度记在账户计划上）
    limit: keyInfo.limit === null || keyInfo.limit === undefined ? null : (Number.isFinite(keyInfo.limit) ? keyInfo.limit : null),
    searchUsage: Number.isFinite(keyInfo.search_usage) ? keyInfo.search_usage : null,
    extractUsage: Number.isFinite(keyInfo.extract_usage) ? keyInfo.extract_usage : null,
    // 账户级计划额度（多密钥共享），作为密钥级上限缺失时的显示回退
    planUsage: Number.isFinite(account.plan_usage) ? account.plan_usage : null,
    planLimit: account.plan_limit === null || account.plan_limit === undefined ? null : (Number.isFinite(account.plan_limit) ? account.plan_limit : null),
  }
}

/** Project a Tavily search response onto the `ctx.web` seam vocabulary. */
function mapSearchResponse(data) {
  const results = Array.isArray(data.results) ? data.results : []
  const sources = []
  for (const item of results) {
    if (!item || typeof item.url !== 'string' || item.url.length === 0) continue
    sources.push({
      url: item.url,
      ...(typeof item.title === 'string' && item.title.length > 0 ? { title: item.title } : {}),
      ...(typeof item.content === 'string' && item.content.length > 0 ? { snippet: item.content } : {}),
      ...(typeof item.published_date === 'string' && item.published_date.length > 0 ? { publishedAt: item.published_date } : {}),
    })
  }
  return {
    ...(typeof data.answer === 'string' && data.answer.length > 0 ? { content: data.answer } : {}),
    sources,
    truncated: false,
  }
}

function isAbortLike(error, signal) {
  if (signal && signal.aborted) return true
  return error instanceof DOMException && error.name === 'AbortError'
}

//#endregion

//#region transport placement (why the mount lives under /api, as exact routes) --------
//
// The webServer dispatches by exact path → longest prefix → fallback, and a blanket
// auth gate is registered as the EMPTY prefix (`path: ''`), the weakest slot in that
// order. So any route with a prefix of its own outranks the gate and serves anonymous
// callers — that is the hole this plugin used to have at `/dsh-tavily`.
//
// Mounting under `/api` is necessary but NOT sufficient, and the difference is easy to
// get wrong (it was, once): an auth gate owns the `/api` PREFIX and additionally wraps
// every EXACT route whose path starts with `/api/` (dsh-webui-auth rescans, so late
// registrations are caught). A plugin that registers its own PREFIX at
// `/api/dsh-tavily` therefore still escapes — longest-prefix dispatch hands it the
// request before the gate's `/api` route is ever consulted. Registering one exact
// route per endpoint is what actually puts these endpoints behind the deployment's own
// admission: its session cookie, or the loopback host-direct exemption it grants
// non-browser callers from this machine. Same policy as the rest of `/api`, nothing
// reimplemented here to drift out of sync, and deployments with no auth plugin behave
// as before.
//
// Do NOT turn these back into a prefix route, and do NOT move them to a root-level
// prefix: both silently unprotect the API.

//#endregion

//#region structured provider error ----------------------------------------------------

/** Mirrors the seam's WebError shape (code field) without importing dsh-web. */
class TavilyProviderError extends Error {
  constructor(message, code, cause) {
    super(message)
    this.name = 'WebError'
    this.code = code
    if (cause !== undefined) this.cause = cause
  }
}

//#endregion

//#region route table ------------------------------------------------------------------

/**
 * Pure router so the URL→handler mapping is testable without a socket.
 * `sub` is whatever follows the mount prefix (leading separator optional).
 */
function pickRoute(method, sub) {
  const clean = String(sub ?? '').replace(/^\/+/, '')
  const parts = clean === '' ? [] : clean.split('/').filter((p) => p.length > 0)
  if (parts.length === 0 && (method === 'GET' || method === 'HEAD')) return { action: 'state' }
  if (parts.length === 1 && parts[0] === 'state' && method === 'GET') return { action: 'state' }
  if (parts.length === 1 && parts[0] === 'config' && method === 'POST') return { action: 'config' }
  if (parts.length === 1 && parts[0] === 'takeover' && method === 'POST') return { action: 'takeover' }
  if (parts.length === 1 && parts[0] === 'keys' && method === 'POST') return { action: 'keys.add' }
  if (parts.length === 2 && parts[0] === 'keys' && parts[1] === 'update' && method === 'POST') return { action: 'keys.update' }
  if (parts.length === 2 && parts[0] === 'keys' && parts[1] === 'move' && method === 'POST') return { action: 'keys.move' }
  if (parts.length === 2 && parts[0] === 'keys' && parts[1] === 'test' && method === 'POST') return { action: 'keys.test' }
  if (parts.length === 2 && parts[0] === 'keys' && parts[1] === 'remove' && method === 'POST') return { action: 'keys.remove' }
  if (parts.length === 2 && parts[0] === 'usage' && parts[1] === 'refresh' && method === 'POST') return { action: 'usage.refresh' }
  return { action: 'notfound' }
}

//#endregion

//#region provider ---------------------------------------------------------------------

/**
 * The Tavily-backed search provider. All mutable coordination state arrives
 * through the `host` facade built in `apply()` — the class itself stays
 * stateless so HMR reloads cannot leak counters across fibers.
 */
class TavilySearchProvider {
  constructor(host) {
    this.host = host
    this.id = PROVIDER_ID
  }

  /** Cheap local check for execution-time selection. Never touches network. */
  available() {
    return this.host.isRouteEligible()
  }

  /**
   * Run one seam search: walk ordered candidates with failover, account
   * credits locally, and project the winning response onto the seam shape.
   */
  async search(request, signal) {
    const host = this.host
    if (!host.isRouteEligible()) {
      throw new TavilyProviderError('Tavily 搜索提供方不可用：替换开关未开启或没有可用密钥', 'WEB_PROVIDER_UNAVAILABLE')
    }
    const config = host.getConfig()
    const query = String(request.query ?? '').trim()
    if (query.length === 0) throw new TavilyProviderError('搜索词不能为空', 'WEB_PROVIDER_ERROR')
    const requested = Number.isInteger(request.maxResults) && request.maxResults >= 1 ? request.maxResults : config.maxResults

    const snapshot = host.getDataSnapshot()
    const candidates = orderKeys(usableKeys(snapshot), config.strategy, snapshot, host.nextRotation(), Date.now())

    let lastError = null
    for (const entry of candidates) {
      if (signal && signal.aborted) break
      try {
        const started = Date.now()
        const { data, credits } = await tavilySearch({
          apiKey: entry.key,
          query,
          maxResults: Math.min(requested, config.maxResults),
          config,
          signal,
        })
        host.recordSuccess(entry.id, credits, Date.now() - started)
        return mapSearchResponse(data)
      } catch (error) {
        if (isAbortLike(error, signal)) {
          throw new TavilyProviderError('Tavily 搜索已取消', 'WEB_ABORTED', error)
        }
        lastError = error
        host.recordFailure(entry.id, error)
        if (typeof error.status === 'number') {
          if (error.status === 401 || error.status === 403) host.setCooldown(entry.id, KEY_COOLDOWN_MS)
          else if (error.status === 432 || error.status === 433) host.setCooldown(entry.id, KEY_COOLDOWN_MS)
          else if (error.status === 429) host.setCooldown(entry.id, RATE_COOLDOWN_MS)
        }
      }
    }
    if (signal && signal.aborted) throw new TavilyProviderError('Tavily 搜索已取消', 'WEB_ABORTED')
    throw new TavilyProviderError(
      `Tavily 搜索失败（已尝试 ${candidates.length} 个密钥）：${lastError ? lastError.message : '无可用密钥'}`,
      'WEB_PROVIDER_ERROR',
      lastError,
    )
  }
}

//#endregion

//#region apply --------------------------------------------------------------------------

export async function apply(ctx, config) {
  const log = (fn, msg) => { try { ctx.logger[fn](msg) } catch { /* logger optional */ } }

  //# persistence location ----
  const dir = profileDirOf() || pluginDir()
  const dataPath = dir
    ? dir.replace(/\\/g, '/').replace(/\/+$/, '') + '/dsh-tavily.json'
    : ((process.env.DSH_HOME || ((process.env.USERPROFILE || process.env.HOME || '.') + '/.dsh')).replace(/\\/g, '/').replace(/\/+$/, '') + '/dsh-tavily.json')

  let data = await readData(ctx, dataPath)
  //# config section ----
  // The switch and search parameters live in this file next to the keys: DSH
  // ≥ 0.2.0 removed the namespace-based `ctx.settings.register()` API, so the
  // card's writes are persisted here. The cordis entry config (the profile
  // patch's `config:` block for our row) only seeds the first run.
  if (data.config === null) data.config = normalizeConfig(config)
  const persist = async () => { await writeData(ctx, dataPath, data) }
  // Best-effort flush of a freshly sanitized document; failures must not block startup.
  try { await persist() } catch (e) { log('warn', `[dsh-tavily] 初始数据落盘失败（将继续以内存态运行）: ${e && e.message}`) }
  const currentConfig = () => data.config

  //# routing takeover over the pinned search provider ----
  // DSH ≤ 0.1.x resolved the search provider from a mutable `web.searchProviderId`
  // field. DSH ≥ 0.2.x removed that field: the service reads the composed
  // `searchProvider` config of its own Loader row at call time (dsh-base pins
  // `deepseek-official` there). Two takeover modes follow:
  //   legacy — redefine that accessor while the switch is on (≤ 0.1.x only);
  //   config — write `searchProvider: dsh-tavily` into the profile patch through
  //            `ctx.configEditor` (0.2.x) and restore the previous effective
  //            config when the switch turns off or the plugin stops being active.
  const ROUTING_MARKER = '__dshTavilyRouting__'
  const web = ctx.web
  const existing = Object.getOwnPropertyDescriptor(web, 'searchProviderId')
  const alreadyOurs = existing && existing.get && existing.get[ROUTING_MARKER] === true
  let baseline = web.searchProviderId
  let overrideInstalled = false
  let routeActive = false
  let takeoverMode = 'none'
  let takeoverError = null
  let takeoverBusy = false

  if (!alreadyOurs && existing && existing.configurable) {
    const originalDescriptor = existing
    const accessor = function () { return routeActive ? PROVIDER_ID : baseline }
    accessor[ROUTING_MARKER] = true
    Object.defineProperty(web, 'searchProviderId', {
      configurable: true,
      enumerable: true,
      get: accessor,
      set(value) { baseline = value }, // external writers (env wiring, other plugins) become the new baseline
    })
    overrideInstalled = true
    takeoverMode = 'legacy'
    ctx.effect(() => () => {
      routeActive = false
      try {
        delete web.searchProviderId
        Object.defineProperty(web, 'searchProviderId', { ...originalDescriptor, value: baseline })
      } catch (e) { log('warn', `[dsh-tavily] 还原 searchProviderId 失败: ${e && e.message}`) }
    }, 'dsh-tavily: routing override teardown')
  } else if (alreadyOurs) {
    overrideInstalled = true
    takeoverMode = 'legacy'
  } else {
    // 0.2.x path: find the `web` Loader row and the profile config editor.
    const configEditor = typeof ctx.get === 'function' ? ctx.get('configEditor') : undefined
    takeoverMode = (configEditor && findWebEntry(ctx)) ? 'config' : 'none'
    if (takeoverMode === 'none') {
      log('warn', '[dsh-tavily] 无法接管搜索提供方：当前 DSH 既没有 web.searchProviderId，也没有 configEditor / @deepseek-ai/dsh-web 行；请在部署配置里把 web.searchProvider 设为 dsh-tavily')
    }
  }

  /** Current pinned provider id: composed `web.searchProvider` config, else the env fallback. */
  function readPinnedProvider() {
    try {
      const raw = web.config && web.config.searchProvider
      const value = raw && typeof raw.get === 'function' ? raw.get() : raw
      if (typeof value === 'string' && value.length > 0) return value
    } catch (e) { /* config shape differs; fall through to the env */ }
    const env = process.env.DSH_WEB_SEARCH_PROVIDER
    return typeof env === 'string' && env.length > 0 ? env : null
  }

  /** Whether execution-time selection currently points at this plugin. */
  function takeoverInstalled() {
    if (takeoverMode === 'legacy') return overrideInstalled && routeActive
    if (takeoverMode === 'config') return readPinnedProvider() === PROVIDER_ID
    return false
  }

  /**
   * Reconcile the pin with the switch. Idempotent by design: it only writes when
   * the composed value disagrees with the desired state, so the Loader reload it
   * triggers (which restarts this plugin's `web` dependency) settles in one pass.
   */
  let takeoverQueue = Promise.resolve()
  function syncTakeover() {
    if (takeoverMode !== 'config') return Promise.resolve()
    if (takeoverBusy) return takeoverQueue
    takeoverQueue = takeoverQueue.then(async () => {
      const desired = routeActive && providerRegistered
      const pinned = readPinnedProvider()
      const editor = typeof ctx.get === 'function' ? ctx.get('configEditor') : undefined
      const entry = findWebEntry(ctx)
      if (!editor || !entry) return
      takeoverBusy = true
      try {
        if (desired && pinned !== PROVIDER_ID) {
          await editor.edit(entry, (current) => {
            // Capture what selection would have been without us, so the off switch
            // restores it exactly instead of guessing a default.
            data.takeover.savedConfig = { ...current }
            data.takeover.pinnedByUs = true
            return { ...current, searchProvider: PROVIDER_ID }
          })
          takeoverError = null
          await persist().catch(() => {})
        } else if (!desired && pinned === PROVIDER_ID && data.takeover.pinnedByUs) {
          const saved = data.takeover.savedConfig
          await editor.edit(entry, (current) => {
            const next = { ...current }
            if (saved && Object.prototype.hasOwnProperty.call(saved, 'searchProvider')) {
              next.searchProvider = saved.searchProvider
            } else {
              delete next.searchProvider
            }
            return next
          })
          data.takeover = emptyTakeover()
          takeoverError = null
          await persist().catch(() => {})
        }
      } catch (e) {
        const message = e && e.message ? String(e.message) : String(e)
        if (/nested/i.test(message)) {
          // Expected at activation: the profile reconcile owns the transaction.
          // Leave `takeoverError` clean — the caller sees `pending` and retries
          // from its own request context.
          takeoverError = null
        } else {
          takeoverError = message
          log('warn', `[dsh-tavily] 接管搜索提供方失败: ${takeoverError}`)
        }
      } finally {
        takeoverBusy = false
      }
    }).catch(() => {})
    return takeoverQueue
  }

  //# provider registration ----
  let providerRegistered = false
  ctx.web.registerSearchProvider(new TavilySearchProvider({
    isRouteEligible: () => routeActive && providerRegistered,
    getConfig: () => currentConfig(),
    getDataSnapshot: () => data,
    nextRotation: (() => {
      let counter = 0
      return () => counter++
    })(),
    recordSuccess: (keyId, credits, ms) => {
      const stats = data.stats[keyId] || (data.stats[keyId] = emptyStats())
      stats.requests += 1
      stats.success += 1
      stats.creditsUsed += credits
      stats.lastUsedAt = nowIso()
      stats.lastError = null
      stats.lastLatencyMs = ms
      const cached = data.usageCache[keyId]
      if (cached) {
        // 密钥级已用与账户级计划已用各自前推，保证两种口径的显示都保持新鲜
        if (cached.usage !== null && cached.usage !== undefined) cached.usage += credits
        if (cached.planUsage !== null && cached.planUsage !== undefined) cached.planUsage += credits
        cached.localAdjustedAt = nowIso()
      }
      scheduleFlush()
    },
    recordFailure: (keyId, error) => {
      const stats = data.stats[keyId] || (data.stats[keyId] = emptyStats())
      stats.requests += 1
      stats.failed += 1
      stats.lastUsedAt = nowIso()
      stats.lastError = error && error.message ? String(error.message) : String(error)
      scheduleFlush()
    },
    setCooldown: (keyId, ms) => {
      const stats = data.stats[keyId] || (data.stats[keyId] = emptyStats())
      stats.cooldownUntil = Date.now() + ms
      scheduleFlush()
    },
  }))
  providerRegistered = true

  function recompute() {
    const cfg = currentConfig()
    routeActive = cfg.enabled === true && usableKeys(data).length > 0
    // No write here: activation runs inside the profile's HMR transaction, and
    // configEditor opens its own exclusive one (a nested call is rejected). The
    // toggle endpoint and the panel's ensure call do the write from a request
    // context, which is outside any transaction; `routing.pending` reports the gap.
  }
  recompute()

  /** Wait for the in-flight takeover write, bounded so an HTTP response can never hang on it. */
  async function settleTakeover(ms = 8000) {
    await Promise.race([
      syncTakeover(),
      new Promise((resolve) => {
        const timer = setTimeout(resolve, ms)
        if (timer && typeof timer.unref === 'function') timer.unref()
      }),
    ])
  }

  //# debounced persistence for hot-path stat writes ----
  let flushTimer = null
  function scheduleFlush() {
    if (flushTimer !== null) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      persist().catch((e) => log('warn', `[dsh-tavily] 统计数据落盘失败: ${e && e.message}`))
    }, 500)
    if (typeof flushTimer === 'object' && flushTimer !== null && typeof flushTimer.unref === 'function') flushTimer.unref()
  }
  ctx.effect(() => () => {
    if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null }
  }, 'dsh-tavily: flush timer')

  //# HTTP surface ----
  function sendJson(res, status, body) {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(body))
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  async function parseJsonBody(req) {
    const raw = await readBody(req)
    if (!raw || !raw.trim()) return {}
    return JSON.parse(raw) // throws SyntaxError -> 400 at the dispatch site
  }

  function publicState() {
    const cfg = currentConfig()
    const keysView = data.keys.map((k, index) => {
      const cached = data.usageCache[k.id] || null
      const fetchedMs = cached && typeof cached.fetchedAt === 'string' ? Date.parse(cached.fetchedAt) : NaN
      const stale = !Number.isFinite(fetchedMs) || (Date.now() - fetchedMs) > USAGE_STALE_MS
      return {
        id: k.id,
        label: k.label,
        masked: maskKey(k.key),
        disabled: k.disabled === true,
        addedAt: k.addedAt,
        hasWarningPrefix: !/^tvly-/i.test(k.key),
        usage: cached,
        stale,
      }
    })
    const statsView = {}
    for (const k of data.keys) {
      const s = data.stats[k.id]
      statsView[k.id] = {
        requests: s ? s.requests : 0,
        success: s ? s.success : 0,
        failed: s ? s.failed : 0,
        creditsUsed: s ? s.creditsUsed : 0,
        lastUsedAt: s ? s.lastUsedAt : null,
        lastError: s ? s.lastError : null,
        lastLatencyMs: s && Number.isFinite(s.lastLatencyMs) ? s.lastLatencyMs : null,
        cooling: cooldownActive(data, k.id, Date.now()),
      }
    }
    return {
      version: '0.2.0',
      config: cfg,
      configSource: 'file',
      dataPath,
      routing: {
        // `active` means "calls actually reach Tavily", not merely "switch is on":
        // it folds in the takeover so a stale switch can never look effective.
        active: routeActive && providerRegistered && takeoverInstalled(),
        providerRegistered,
        mode: takeoverMode,
        installed: takeoverInstalled(),
        // The switch is on but the pin is not ours: the panel asks for a repair.
        pending: takeoverMode === 'config' && routeActive && providerRegistered && readPinnedProvider() !== PROVIDER_ID,
        pinnedProvider: readPinnedProvider(),
        overrideInstalled,
        baselineId: baseline === undefined ? null : baseline,
        registeredProviders: Array.from(web.searchProviders ? web.searchProviders.keys() : []),
        officialDetected: Boolean(web.searchProviders && web.searchProviders.has && web.searchProviders.has('deepseek-official')),
        error: takeoverError,
      },
      keys: keysView,
      order: [...data.order],
      stats: statsView,
    }
  }

  function findKey(id) {
    return data.keys.find((k) => k.id === id) || null
  }

  const handlers = {
    async state(req, res) {
      sendJson(res, 200, { ok: true, state: publicState() })
    },

    async config(req, res) {
      const body = await parseJsonBody(req)
      const patch = {}
      if (body.enabled !== undefined) {
        if (typeof body.enabled !== 'boolean') { sendJson(res, 400, { ok: false, error: 'enabled 必须是布尔值' }); return }
        patch.enabled = body.enabled
      }
      if (body.strategy !== undefined) {
        if (!STRATEGIES.includes(body.strategy)) { sendJson(res, 400, { ok: false, error: 'strategy 必须是 balance 或 manual' }); return }
        patch.strategy = body.strategy
      }
      if (body.searchDepth !== undefined) {
        if (!SEARCH_DEPTHS.includes(body.searchDepth)) { sendJson(res, 400, { ok: false, error: 'searchDepth 必须是 basic / advanced / fast / ultra-fast' }); return }
        patch.searchDepth = body.searchDepth
      }
      if (body.maxResults !== undefined) {
        const n = Number(body.maxResults)
        if (!Number.isInteger(n) || n < 1 || n > 20) { sendJson(res, 400, { ok: false, error: 'maxResults 必须是 1-20 的整数' }); return }
        patch.maxResults = n
      }
      if (body.topic !== undefined) {
        if (!TOPICS.includes(body.topic)) { sendJson(res, 400, { ok: false, error: 'topic 必须是 general / news / finance' }); return }
        patch.topic = body.topic
      }
      if (body.includeAnswer !== undefined) {
        if (typeof body.includeAnswer !== 'boolean') { sendJson(res, 400, { ok: false, error: 'includeAnswer 必须是布尔值' }); return }
        patch.includeAnswer = body.includeAnswer
      }
      const previousConfig = data.config
      data.config = normalizeConfig({ ...previousConfig, ...patch })
      try { await persist() } catch (e) {
        data.config = previousConfig // 回滚，避免面板显示已开启却没落盘
        sendJson(res, 500, { ok: false, error: `配置落盘失败: ${e && e.message}` }); return
      }
      recompute()
      // The toggle is the one action whose whole point is the pin: wait for the
      // write so the response already reports the new routing state.
      await settleTakeover()
      sendJson(res, 200, { ok: true, state: publicState() })
    },

    /**
     * Ensure the pin matches the switch. Exists because the write must happen from a
     * request context: activation runs inside the profile reconcile's HMR transaction
     * and configEditor cannot open a nested one.
     */
    async takeover(req, res) {
      recompute()
      await settleTakeover()
      sendJson(res, 200, { ok: true, state: publicState() })
    },

    async 'keys.add'(req, res) {
      const body = await parseJsonBody(req)
      const key = typeof body.key === 'string' ? body.key.trim() : ''
      const label = typeof body.label === 'string' ? body.label.trim() : ''
      if (key.length < 8) { sendJson(res, 400, { ok: false, error: '请输入有效的 Tavily API Key' }); return }
      if (data.keys.some((k) => k.key === key)) { sendJson(res, 400, { ok: false, error: '该密钥已存在' }); return }
      const entry = { id: genId('tvly'), key, label: label || maskKey(key), addedAt: nowIso(), disabled: false }
      data.keys.push(entry)
      data.order.push(entry.id)
      data.stats[entry.id] = emptyStats()
      try { await persist() } catch (e) { log('warn', `[dsh-tavily] 密钥落盘失败: ${e && e.message}`) }
      recompute()
      sendJson(res, 200, { ok: true, state: publicState() })
    },

    async 'keys.update'(req, res) {
      const body = await parseJsonBody(req)
      const entry = findKey(typeof body.id === 'string' ? body.id : '')
      if (!entry) { sendJson(res, 404, { ok: false, error: '密钥不存在' }); return }
      if (body.label !== undefined) {
        if (typeof body.label !== 'string') { sendJson(res, 400, { ok: false, error: 'label 必须是字符串' }); return }
        entry.label = body.label.trim() || maskKey(entry.key)
      }
      if (body.disabled !== undefined) {
        if (typeof body.disabled !== 'boolean') { sendJson(res, 400, { ok: false, error: 'disabled 必须是布尔值' }); return }
        entry.disabled = body.disabled
      }
      if (body.removeCooldown === true) {
        const s = data.stats[entry.id]
        if (s) delete s.cooldownUntil
      }
      if (body.resetStats === true) data.stats[entry.id] = emptyStats()
      try { await persist() } catch (e) { log('warn', `[dsh-tavily] 更新落盘失败: ${e && e.message}`) }
      recompute()
      sendJson(res, 200, { ok: true, state: publicState() })
    },

    async 'keys.move'(req, res) {
      const body = await parseJsonBody(req)
      const id = typeof body.id === 'string' ? body.id : ''
      const dirStep = body.dir === 1 || body.dir === '1' ? 1 : body.dir === -1 || body.dir === '-1' ? -1 : 0
      if (dirStep === 0) { sendJson(res, 400, { ok: false, error: 'dir 必须是 1 或 -1' }); return }
      // Move within the FULL key list so ↑↓ matches what the user sees.
      const ids = data.keys.map((k) => k.id)
      const at = ids.indexOf(id)
      const to = at + dirStep
      if (at === -1) { sendJson(res, 404, { ok: false, error: '密钥不存在' }); return }
      if (to >= 0 && to < ids.length) {
        ids.splice(to, 0, ids.splice(at, 1)[0])
        data.order = ids
      }
      try { await persist() } catch (e) { log('warn', `[dsh-tavily] 排序落盘失败: ${e && e.message}`) }
      sendJson(res, 200, { ok: true, state: publicState() })
    },

    async 'keys.remove'(req, res) {
      const body = await parseJsonBody(req)
      const id = typeof body.id === 'string' ? body.id : ''
      const at = data.keys.findIndex((k) => k.id === id)
      if (at === -1) { sendJson(res, 404, { ok: false, error: '密钥不存在' }); return }
      data.keys.splice(at, 1)
      data.order = data.order.filter((x) => x !== id)
      delete data.stats[id]
      delete data.usageCache[id]
      try { await persist() } catch (e) { log('warn', `[dsh-tavily] 删除落盘失败: ${e && e.message}`) }
      recompute()
      sendJson(res, 200, { ok: true, state: publicState() })
    },

    async 'keys.test'(req, res) {
      const body = await parseJsonBody(req)
      const entry = findKey(typeof body.id === 'string' ? body.id : '')
      if (!entry) { sendJson(res, 404, { ok: false, error: '密钥不存在' }); return }
      const cfg = currentConfig()
      const started = Date.now()
      try {
        const { credits } = await tavilySearch({
          apiKey: entry.key,
          query: 'tavily connectivity check',
          maxResults: 1,
          config: { ...cfg, searchDepth: 'basic', includeAnswer: false },
          signal: undefined,
        })
        hostlessRecordSuccess(entry.id, credits, Date.now() - started)
        const s = data.stats[entry.id]
        if (s) delete s.cooldownUntil
        try { await persist() } catch { /* best effort */ }
        sendJson(res, 200, {
          ok: true,
          result: { latencyMs: Date.now() - started, credits },
          state: publicState(),
        })
      } catch (error) {
        hostlessRecordFailure(entry.id, error)
        if (typeof error.status === 'number' && (error.status === 401 || error.status === 403 || error.status === 432 || error.status === 433)) {
          const s = data.stats[entry.id] || (data.stats[entry.id] = emptyStats())
          s.cooldownUntil = Date.now() + KEY_COOLDOWN_MS
        }
        try { await persist() } catch { /* best effort */ }
        sendJson(res, 200, { ok: false, error: error && error.message ? error.message : String(error), state: publicState() })
      }
    },

    async 'usage.refresh'(req, res) {
      const results = {}
      for (const entry of data.keys) {
        try {
          const usage = await tavilyUsage(entry.key, undefined)
          data.usageCache[entry.id] = usage
          results[entry.id] = { ok: true }
        } catch (error) {
          results[entry.id] = { ok: false, error: error && error.message ? error.message : String(error) }
        }
      }
      try { await persist() } catch (e) { log('warn', `[dsh-tavily] 用量缓存落盘失败: ${e && e.message}`) }
      sendJson(res, 200, { ok: true, results, state: publicState() })
    },
  }

  // Test handler shares the success/failure bookkeeping minus rotation side effects.
  function hostlessRecordSuccess(keyId, credits, ms) {
    const stats = data.stats[keyId] || (data.stats[keyId] = emptyStats())
    stats.requests += 1
    stats.success += 1
    stats.creditsUsed += credits
    stats.lastUsedAt = nowIso()
    stats.lastError = null
    stats.lastLatencyMs = ms
    const cached = data.usageCache[keyId]
    if (cached && cached.usage !== null && cached.usage !== undefined) {
      cached.usage += credits
      cached.localAdjustedAt = nowIso()
    }
  }
  function hostlessRecordFailure(keyId, error) {
    const stats = data.stats[keyId] || (data.stats[keyId] = emptyStats())
    stats.requests += 1
    stats.failed += 1
    stats.lastUsedAt = nowIso()
    stats.lastError = error && error.message ? String(error.message) : String(error)
  }

  //# http endpoints ----
  // One EXACT route per endpoint, deliberately not a prefix route: a gate wraps the
  // `/api` prefix plus every exact route beneath it, while a plugin-declared prefix
  // (even a nested one like `/api/dsh-tavily`) wins longest-prefix dispatch and would
  // never be seen by the gate. Exact routes also mean unknown sub-paths never reach
  // this plugin at all. See the "transport placement" note at the top of the file.
  async function serveHttp(req, res) {
    try {
      let pathname = String(req.url ?? '/')
      const q = pathname.indexOf('?')
      if (q !== -1) pathname = pathname.slice(0, q)
      const sub = pathname.startsWith(HTTP_PREFIX) ? pathname.slice(HTTP_PREFIX.length) : pathname
      const route = pickRoute(req.method, sub)
      const handler = handlers[route.action]
      if (!handler) { sendJson(res, 404, { ok: false, error: `未知端点: ${req.method} ${pathname}` }); return }
      await handler(req, res)
    } catch (error) {
      const syntax = error instanceof SyntaxError
      sendJson(res, syntax ? 400 : 500, { ok: false, error: error && error.message ? error.message : String(error) })
    }
  }

  ctx.effect(() => {
    const disposers = HTTP_ROUTES.map((path) => ctx.webServer.register({ kind: 'exact', path, handler: serveHttp }))
    return () => { for (const dispose of disposers) { try { dispose() } catch { /* already gone */ } } }
  }, 'dsh-tavily: http endpoints')

  log('info', `[dsh-tavily] 已加载。数据文件: ${dataPath}；HTTP 端点: ${HTTP_ROUTES.join(', ')}（/api 下的 exact 路由，随部署认证闸门）；路由状态: ${routeActive ? '已接管网页搜索' : '未接管'}；官方搜索提供方${web.searchProviders && web.searchProviders.has('deepseek-official') ? '已检测到' : '未检测到'}。`)
}

//#endregion

//#region exported internals (unit-test surface) -----------------------------------------

export const __internals = {
  CONFIG_DEFAULTS,
  PROVIDER_ID,
  HTTP_PREFIX,
  HTTP_ROUTES,
  normalizeConfig,
  sanitizeData,
  maskKey,
  usableKeys,
  orderKeys,
  remainingRank,
  cooldownActive,
  mapSearchResponse,
  pickRoute,
  tavilySearch,
  tavilyUsage,
  TavilySearchProvider,
  TavilyProviderError,
}

//#endregion
