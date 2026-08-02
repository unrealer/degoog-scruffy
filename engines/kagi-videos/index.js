// Kagi Videos engine for degoog (workflow: videos).
export const type = "videos";

const API_URL = "https://kagi.com/api/v1/search";
const MAX_PAGE = 10;
const DEDUPE_TTL_MS = 60_000;
const HOURLY_REQUEST_LIMIT = 60;
const HOURLY_WINDOW_MS = 3_600_000;
const GUARD_KEY = Symbol.for("unrealer.degoog-scruffy.kagi-request-guard.v1");

const guardState = globalThis[GUARD_KEY] ??= { entries: new Map(), requestTimes: [] };

const _guardedRequest = (key, requestFn) => {
  const now = Date.now();
  guardState.requestTimes = guardState.requestTimes.filter((timestamp) => now - timestamp < HOURLY_WINDOW_MS);
  for (const [entryKey, entry] of guardState.entries) {
    if (now - entry.createdAt >= DEDUPE_TTL_MS) guardState.entries.delete(entryKey);
  }
  const existing = guardState.entries.get(key);
  if (existing) return existing.promise;
  if (guardState.requestTimes.length >= HOURLY_REQUEST_LIMIT) {
    const promise = Promise.resolve(null);
    guardState.entries.set(key, { createdAt: now, promise });
    return promise;
  }
  guardState.requestTimes.push(now);
  const promise = Promise.resolve().then(requestFn);
  guardState.entries.set(key, { createdAt: now, promise });
  return promise;
};

const _decodeEntities = (s) => String(s ?? "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&#x0*27;/gi, "'");
const _clean = (h) => _decodeEntities(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function kagiSearch(opts, query, page, context) {
  const q = (query || "").trim();
  if (!q || !opts.apiKey) return null;
  const pageNum = page || 1;
  if (pageNum > MAX_PAGE) return null;
  const requestKey = `${opts.workflow}\u0000${q}\u0000${pageNum}\u0000${opts.limit}\u0000${opts.safeSearch}`;
  return _guardedRequest(requestKey, async () => {
    const doFetch = context?.fetch ?? fetch;
    let response;
    try {
      response = await doFetch(API_URL, {
        method: "POST",
        headers: { Authorization: `Bot ${opts.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: q, workflow: opts.workflow, limit: opts.limit, page: pageNum, safe_search: opts.safeSearch }),
      });
    } catch (e) {
      if (e?.name === "SentinelBreach") throw e;
      return null;
    }
    context?.sentinel?.(response, opts.name);
    try {
      const data = await response.json();
      if (!data || (Array.isArray(data.error) && data.error.length)) return null;
      return data.data ?? null;
    } catch { return null; }
  });
}

export default class KagiVideosEngine {
  isClientExposed = false;
  name = "Kagi Videos";
  bangShortcut = "kagivideos";
  settingsSchema = [
    { key: "apiKey", label: "API Key", type: "password", secret: true, required: true, placeholder: "Enter your Kagi API key", description: "Create a key at kagi.com/settings?p=api. Each search is billed against your Kagi API balance." },
    { key: "limit", label: "Results per page", type: "number", default: 10, description: "Maximum video results requested per page (Kagi allows 1-1024)." },
    { key: "safeSearch", label: "Safe Search", type: "toggle", default: true, description: "Filter explicit content from results." },
  ];
  apiKey = "";
  limit = 10;
  safeSearch = true;
  configure(settings) {
    this.apiKey = settings.apiKey || "";
    const parsed = parseInt(settings.limit, 10);
    this.limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1024) : 10;
    if (typeof settings.safeSearch === "boolean") this.safeSearch = settings.safeSearch;
    else if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch !== "false";
  }
  async executeSearch(query, page = 1, _timeFilter, context) {
    const data = await kagiSearch({ apiKey: this.apiKey, limit: this.limit, safeSearch: this.safeSearch, workflow: "videos", name: this.name }, query, page, context);
    const items = data?.video;
    if (!Array.isArray(items)) return [];
    return items.filter((item) => item && item.url && item.title).map((item) => ({ title: _clean(item.title), url: item.url, snippet: _clean(item.snippet), source: this.name, thumbnail: item.image?.url ?? "", duration: "" }));
  }
}
