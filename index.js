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
 * - `WebRuntime` resolves the provider at call time from its `searchProviderId`
 *   field (configured id wins; otherwise the single usable provider runs). We
 *   redefine that field as an accessor on the service instance: while the user
 *   switch is ON and at least one key is usable, reads yield 'dsh-tavily';
 *   otherwise they fall through to the untouched baseline (undefined or an
 *   explicit `$DSH_WEB_SEARCH_PROVIDER` value). The override is reversible and
 *   removed when the plugin unloads.
 * - `available()` mirrors the same condition, so even if a future runtime stops
 *   consulting the field, auto-selection degrades gracefully to the official
 *   provider instead of reporting ambiguity.
 *
 * Configuration surfaces:
 * - Settings namespace `dsh-tavily` (schema hand-rolled to stay import-free;
 *   callable + toJSON is all `SettingsProvider` consumes). The Plugins →
 *   Plugin configuration tab dispatches our browser card by this namespace.
 * - Same-origin HTTP endpoints under `/dsh-tavily/*` serve the card: key pool,
 *   per-key usage stats, ordering, tests, and live balance refreshes.
 *
 * Data: keys / stats / balance cache persist to `<profile>/dsh-tavily.json`
 * (user-owned, survives upgrades). Secrets never ride HTTP responses — the UI
 * only ever sees masked keys.
 */

export const name = 'dsh-tavily'

export const inject = ['web', 'webServer', 'fs', 'settings']

//#region constants -----------------------------------------------------------------

/** Provider id inside `ctx.web`. Unique against 'deepseek-official' etc. */
const PROVIDER_ID = 'dsh-tavily'

/** Settings namespace served to the Plugins → Plugin configuration tab. */
const SETTINGS_NAMESPACE = 'dsh-tavily'

/** HTTP mount (prefix match: `/dsh-tavily` and `/dsh-tavily/<sub>`). */
const HTTP_PREFIX = '/dsh-tavily'

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
const TAVILY_USAGE_URL = 'https://api.tavily.com/usage'
const USER_AGENT = 'dsh-tavily/0.1.0 (deepseek-harness plugin)'

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

//#region config normalization + hand-rolled schema ----------------------------------

/**
 * Total-function normalization of one raw config section. Doubles as the
 * schemastery-style resolver: unknown shapes collapse to defaults, invalid
 * fields snap back instead of throwing (a stored section can never brick the
 * settings service).
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

/**
 * Minimal schemastery-compatible schema. `SettingsProvider` only calls the
 * schema as a function (resolve) and `schema.toJSON()` (describe); secret
 * redaction walks `type`/`dict` and passes unknown nodes through untouched.
 */
function buildSchema() {
  const schema = (value) => normalizeConfig(value)
  schema.toJSON = () => ({
    type: 'object',
    dict: {
      enabled: { type: 'boolean', default: CONFIG_DEFAULTS.enabled },
      strategy: { type: 'string', default: CONFIG_DEFAULTS.strategy },
      searchDepth: { type: 'string', default: CONFIG_DEFAULTS.searchDepth },
      maxResults: { type: 'number', default: CONFIG_DEFAULTS.maxResults },
      topic: { type: 'string', default: CONFIG_DEFAULTS.topic },
      includeAnswer: { type: 'boolean', default: CONFIG_DEFAULTS.includeAnswer },
    },
  })
  return schema
}

//#endregion

//#region persisted state (keys / stats / balance cache) ------------------------------

function emptyStats() {
  return { requests: 0, success: 0, failed: 0, creditsUsed: 0, lastUsedAt: null, lastError: null }
}

function sanitizeData(raw) {
  const src = (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {}
  const out = { keys: [], order: [], stats: {}, usageCache: {} }
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

//#region optional session guard (dsh-webui-auth compatible) ----------------------------
//
// The webServer dispatches by longest-prefix, so any plugin route escapes a
// blanket auth prefix (dsh-webui-auth wraps `/api` and `/plugins`, but a longer
// custom prefix wins). Deployments that expose the GUI through a reverse proxy
// therefore need per-plugin enforcement. When a dsh-webui-auth session store is
// found on disk we validate its `dsh_wua_session` cookie ourselves — same JSONL
// replay semantics (add/remove/remove-many/clear + expiry pruning), so logout
// and password-change revocation apply immediately. Without such a store the
// endpoints stay open (plain loopback deployments).

function parseCookies(header) {
  const out = {}
  for (const part of String(header ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const k = part.slice(0, eq).trim()
    if (k.length > 0) out[k] = part.slice(eq + 1).trim()
  }
  return out
}

/** Candidate locations of dsh-webui-auth's sessions.jsonl (first existing wins). */
function sessionStoreCandidates() {
  const candidates = []
  if (process.env.DSH_WEBUI_AUTH_DATA_DIR) {
    candidates.push(process.env.DSH_WEBUI_AUTH_DATA_DIR.replace(/\\/g, '/').replace(/\/+$/, '') + '/sessions.jsonl')
  }
  const profile = profileDirOf()
  if (profile) candidates.push(profile.replace(/\\/g, '/').replace(/\/+$/, '') + '/node_modules/dsh-webui-auth/sessions.jsonl')
  const home = (process.env.DSH_HOME || ((process.env.USERPROFILE || process.env.HOME || '.') + '/.dsh')).replace(/\\/g, '/').replace(/\/+$/, '')
  candidates.push(home + '/dsh-webui-auth/sessions.jsonl')
  // Sibling of the package directory (store installs put both under node_modules/).
  const pdir = pluginDir()
  if (pdir) candidates.push(pdir.replace(/\\/g, '/').replace(/\/+$/, '') + '/../dsh-webui-auth/sessions.jsonl')
  return candidates
}

async function findWebuiAuthSessionsFile(ctx) {
  for (const candidate of sessionStoreCandidates()) {
    try {
      const target = await ctx.fs.resolve(candidate)
      const text = await ctx.fs.readText(target)
      if (typeof text === 'string') return target
    } catch (e) { /* try next candidate */ }
  }
  return null
}

/**
 * Build a verifier against one sessions.jsonl path. The store disappearing
 * mid-run degrades verification to open rather than bricking the card.
 */
function createSessionVerifier(ctx, sessionsFile) {
  const COOKIE_NAME = 'dsh_wua_session'
  function replay(text) {
    const live = new Map()
    for (const line of String(text ?? '').split('\n')) {
      if (!line.trim()) continue
      let ev = null
      try { ev = JSON.parse(line) } catch { continue }
      if (!ev || typeof ev.op !== 'string') continue
      // 注意：clear 不携带 token、remove-many 携带 tokens 数组，
      // 因此不能在循环头部统一要求 token 字段。
      if (ev.op === 'add' && typeof ev.token === 'string' && ev.sess && typeof ev.sess === 'object') {
        const expiresAt = Number(ev.sess.expiresAt) || 0
        if (expiresAt > Date.now()) live.set(ev.token, expiresAt)
      } else if (ev.op === 'remove' && typeof ev.token === 'string') {
        live.delete(ev.token)
      } else if (ev.op === 'remove-many' && Array.isArray(ev.tokens)) {
        for (const t of ev.tokens) live.delete(t)
      } else if (ev.op === 'clear') {
        live.clear()
      }
    }
    return live
  }
  let cacheText = null
  let cacheTokens = null
  async function liveTokens() {
    try {
      const target = await ctx.fs.resolve(sessionsFile)
      const text = await ctx.fs.readText(target)
      if (text !== cacheText) { cacheText = text; cacheTokens = replay(text) }
      return cacheTokens || new Map()
    } catch (e) {
      cacheText = null; cacheTokens = null
      return null
    }
  }
  return {
    enabled: true,
    async verify(req) {
      const cookies = parseCookies(req.headers && req.headers.cookie)
      const token = cookies[COOKIE_NAME]
      if (!token) return false
      const tokens = await liveTokens()
      if (tokens === null) return true
      const expiresAt = tokens.get(token)
      return typeof expiresAt === 'number' && expiresAt > Date.now()
    },
  }
}

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
  const persist = async () => { await writeData(ctx, dataPath, data) }
  // Best-effort flush of a freshly sanitized document; failures must not block startup.
  try { await persist() } catch (e) { log('warn', `[dsh-tavily] 初始数据落盘失败（将继续以内存态运行）: ${e && e.message}`) }

  //# settings section ----
  let currentConfig = () => ({ ...CONFIG_DEFAULTS })
  const configEntry = normalizeConfig(config)
  let settingsBound = false
  let unregisterSettingsWatch = null
  try {
    if (ctx.settings && typeof ctx.settings.register === 'function') {
      const scope = ctx.settings.register(SETTINGS_NAMESPACE, buildSchema(), { base: configEntry })
      currentConfig = () => normalizeConfig(scope.get())
      unregisterSettingsWatch = scope.watch(() => { recompute(); })
      settingsBound = true
    } else {
      log('warn', '[dsh-tavily] settings 服务不可用，配置将保持默认值（开关无法持久化）')
    }
  } catch (e) {
    log('warn', `[dsh-tavily] 注册设置命名空间失败: ${e && e.message}`)
  }
  ctx.effect(() => () => {
    if (typeof unregisterSettingsWatch === 'function') { try { unregisterSettingsWatch() } catch { /* noop */ } }
    currentConfig = () => ({ ...CONFIG_DEFAULTS })
    recompute()
  }, 'dsh-tavily: settings teardown')

  //# routing override over WebRuntime.searchProviderId ----
  const ROUTING_MARKER = '__dshTavilyRouting__'
  const web = ctx.web
  const existing = Object.getOwnPropertyDescriptor(web, 'searchProviderId')
  const alreadyOurs = existing && existing.get && existing.get[ROUTING_MARKER] === true
  let baseline = web.searchProviderId
  let overrideInstalled = false
  let routeActive = false

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
    ctx.effect(() => () => {
      routeActive = false
      try {
        delete web.searchProviderId
        Object.defineProperty(web, 'searchProviderId', { ...originalDescriptor, value: baseline })
      } catch (e) { log('warn', `[dsh-tavily] 还原 searchProviderId 失败: ${e && e.message}`) }
    }, 'dsh-tavily: routing override teardown')
  } else if (alreadyOurs) {
    overrideInstalled = true
  } else {
    log('warn', '[dsh-tavily] 无法接管 web.searchProviderId（属性不可配置）；替换功能将依赖自动选择，可能与官方搜索产生歧义冲突')
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
  }
  recompute()

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
      version: '0.1.0',
      config: cfg,
      settingsBound,
      dataPath,
      routing: {
        active: routeActive && providerRegistered,
        providerRegistered,
        overrideInstalled,
        baselineId: baseline === undefined ? null : baseline,
        registeredProviders: Array.from(web.searchProviders ? web.searchProviders.keys() : []),
        officialDetected: Boolean(web.searchProviders && web.searchProviders.has && web.searchProviders.has('deepseek-official')),
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
      if (settingsBound) {
        try { await ctx.settings.update(SETTINGS_NAMESPACE, patch) } catch (e) {
          sendJson(res, 500, { ok: false, error: `写入设置失败: ${e && e.message}` }); return
        }
      } else {
        sendJson(res, 500, { ok: false, error: 'settings 服务不可用，无法保存配置' }); return
      }
      recompute()
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

  //# optional webui-auth session guard ----
  const sessionStoreFile = await findWebuiAuthSessionsFile(ctx)
  const sessionVerifier = sessionStoreFile ? createSessionVerifier(ctx, sessionStoreFile) : null
  if (sessionVerifier) log('info', `[dsh-tavily] 已启用 dsh-webui-auth 会话校验（${sessionStoreFile}）`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: HTTP_PREFIX,
    handler: async (req, res) => {
      try {
        if (sessionVerifier && !(await sessionVerifier.verify(req))) {
          sendJson(res, 401, { ok: false, error: 'unauthorized: 请先登录 Web UI' })
          return
        }
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
    },
  }), 'dsh-tavily: http endpoints')

  log('info', `[dsh-tavily] 已加载。数据文件: ${dataPath}；路由状态: ${routeActive ? '已接管网页搜索' : '未接管'}；官方搜索提供方${web.searchProviders && web.searchProviders.has('deepseek-official') ? '已检测到' : '未检测到'}。`)
}

//#endregion

//#region exported internals (unit-test surface) -----------------------------------------

export const __internals = {
  CONFIG_DEFAULTS,
  PROVIDER_ID,
  SETTINGS_NAMESPACE,
  HTTP_PREFIX,
  normalizeConfig,
  buildSchema,
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
  parseCookies,
  findWebuiAuthSessionsFile,
  createSessionVerifier,
  TavilySearchProvider,
  TavilyProviderError,
}

//#endregion
