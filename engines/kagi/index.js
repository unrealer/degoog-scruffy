// Kagi Search engine for degoog.
//
// Talks to the Kagi Search API (POST /api/v1/search). degoog loads engines as
// bare ES modules in its own process, so we cannot import Kagi's official
// `@kagi/api` client (it carries npm/transitive deps degoog never installs).
// Instead this is a thin `fetch` wrapper whose request/response shapes mirror
// Kagi's official OpenAPI types exactly:
//   request:  SearchRequest        (query, limit, page, safe_search, workflow)
//   response: Search200ResponseData ({ search: SearchResult[], ... })
//   item:     SearchResult         ({ url, title, snippet, time, image, props })
// Ref: https://github.com/kagisearch/kagi-openapi-typescript

const API_URL = "https://kagi.com/api/v1/search";
const MAX_PAGE = 10; // SearchRequest.page is constrained to 1..10 by the API.

// Kagi snippets arrive HTML-escaped (e.g. &amp;, &#39;) and may carry markup.
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

    // Toggles arrive as the string "true"/"false" from the settings UI, but
    // tolerate real booleans too.
    if (typeof settings.safeSearch === "boolean") {
      this.safeSearch = settings.safeSearch;
    } else if (typeof settings.safeSearch === "string") {
      this.safeSearch = settings.safeSearch !== "false";
    }
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const q = (query || "").trim();
    if (!q || !this.apiKey) return [];

    // The Kagi Search API caps pagination at page 10. Each page is a separate
    // billed query, so anything beyond the cap simply returns nothing rather
    // than re-fetching page 1.
    const pageNum = page || 1;
    if (pageNum > MAX_PAGE) return [];

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
      return [];
    }

    context?.sentinel?.(response, this.name);

    let data;
    try {
      data = await response.json();
    } catch {
      return [];
    }

    // Error envelope: { meta, data: null, error: [{ code, message, ... }] }.
    if (!data || Array.isArray(data.error) && data.error.length) return [];

    const items = data?.data?.search;
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
