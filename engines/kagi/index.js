// Kagi Search engine for degoog.
//
// Talks to the Kagi Search API (POST /api/v1/search). degoog loads engines as
// bare ES modules in its own process, so we cannot import Kagi's official
// `@kagi/api` client (it carries npm/transitive deps degoog never installs).
// Instead this is a thin `fetch` wrapper whose request/response shapes mirror
// Kagi's official OpenAPI types exactly.

const API_URL = "https://kagi.com/api/v1/search";
const MAX_PAGE = 10;
const DEDUPE_TTL_MS = 60_000;
const HOURLY_REQUEST_LIMIT = 60;
const HOURLY_WINDOW_MS = 3_600_000;
const GUARD_KEY = Symbol.for("unrealer.degoog-scruffy.kagi-request-guard.v1");

const guardState = globalThis[GUARD_KEY] ??= {
  entries: new Map(),
  requestTimes: [],
};

const _guardedRequest = (key, requestFn) => {
  const now = Date.now();
  guardState.requestTimes = guardState.requestTimes.filter(
    (timestamp) => now - timestamp < HOURLY_WINDOW_MS,
  );
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

const _decodeEntities = (str) =>
  str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'");

const _clean = (html) =>
  _decodeEntities(String(html ?? ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export default class KagiEngine {
  isClientExposed = false;
  name = "Kagi";
  bangShortcut = "kagi";

  settingsSchema = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      secret: true,
      required: true,
      placeholder: "Enter your Kagi API key",
      description: "Create a key at kagi.com/settings?p=api. Note: each search is billed against your Kagi API balance.",
    },
    {
      key: "limit",
      label: "Results per page",
      type: "number",
      default: 10,
      description: "Maximum web results requested per page (Kagi allows 1-1024). Higher values may cost more.",
    },
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "toggle",
      default: true,
      description: "Filter explicit content from results.",
    },
  ];

  apiKey = "";
  limit = 10;
  safeSearch = true;

  configure(settings) {
    this.apiKey = settings.apiKey || "";
    const parsedLimit = parseInt(settings.limit, 10);
    this.limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 1024) : 10;
    if (typeof settings.safeSearch === "boolean") this.safeSearch = settings.safeSearch;
    else if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch !== "false";
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const q = (query || "").trim();
    if (!q || !this.apiKey) return [];

    const pageNum = page || 1;
    if (pageNum > MAX_PAGE) return [];

    const requestKey = `search\u0000${q}\u0000${pageNum}\u0000${this.limit}\u0000${this.safeSearch}`;
    const data = await _guardedRequest(requestKey, async () => {
      const doFetch = context?.fetch ?? fetch;
      let response;
      try {
        response = await doFetch(API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bot ${this.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            query: q,
            workflow: "search",
            limit: this.limit,
            page: pageNum,
            safe_search: this.safeSearch,
          }),
        });
      } catch (e) {
        if (e?.name === "SentinelBreach") throw e;
        return null;
      }

      context?.sentinel?.(response, this.name);
      try {
        const payload = await response.json();
        if (!payload || (Array.isArray(payload.error) && payload.error.length)) return null;
        return payload.data ?? null;
      } catch {
        return null;
      }
    });

    const items = data?.search;
    if (!Array.isArray(items)) return [];

    return items
      .filter((item) => item && item.url && item.title)
      .map((item) => ({
        title: _clean(item.title),
        url: item.url,
        snippet: _clean(item.snippet),
        source: this.name,
        thumbnail: item.image?.url ?? "",
      }));
  }
}
