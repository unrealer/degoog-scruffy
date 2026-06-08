// Kagi News engine for degoog (workflow: news).
// Self-contained: degoog copies each engine directory independently on install.
// Shapes mirror https://github.com/kagisearch/kagi-openapi-typescript

export const type = "news";

const API_URL = "https://kagi.com/api/v1/search";
const MAX_PAGE = 10;

const _decodeEntities = (s) =>
  String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'");

const _clean = (h) =>
  _decodeEntities(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function kagiSearch(opts, query, page, context) {
  const q = (query || "").trim();
  if (!q || !opts.apiKey) return null;
  const pageNum = page || 1;
  if (pageNum > MAX_PAGE) return null;

  const doFetch = context?.fetch ?? fetch;
  let response;
  try {
    response = await doFetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bot ${opts.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: q,
        workflow: opts.workflow,
        limit: opts.limit,
        page: pageNum,
        safe_search: opts.safeSearch,
      }),
    });
  } catch (e) {
    if (e?.name === "SentinelBreach") throw e;
    return null;
  }

  context?.sentinel?.(response, opts.name);

  let data;
  try {
    data = await response.json();
  } catch {
    return null;
  }
  if (!data || (Array.isArray(data.error) && data.error.length)) return null;
  return data?.data ?? null;
}

export default class KagiNewsEngine {
  isClientExposed = false;
  name = "Kagi News";
  bangShortcut = "kaginews";

  settingsSchema = [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      secret: true,
      required: true,
      placeholder: "Enter your Kagi API key",
      description: "Create a key at kagi.com/settings?p=api. Each search is billed against your Kagi API balance.",
    },
    {
      key: "limit",
      label: "Results per page",
      type: "number",
      default: 10,
      description: "Maximum news results requested per page (Kagi allows 1-1024).",
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
    const parsed = parseInt(settings.limit, 10);
    this.limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1024) : 10;
    if (typeof settings.safeSearch === "boolean") this.safeSearch = settings.safeSearch;
    else if (typeof settings.safeSearch === "string") this.safeSearch = settings.safeSearch !== "false";
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const data = await kagiSearch(
      { apiKey: this.apiKey, limit: this.limit, safeSearch: this.safeSearch, workflow: "news", name: this.name },
      query,
      page,
      context,
    );
    const items = data?.news;
    if (!Array.isArray(items)) return [];

    return items
      .filter((item) => item && item.url && item.title)
      .map((item) => ({
        title: _clean(item.title),
        url: item.url,
        snippet: _clean(item.snippet),
        source: this.name,
        ...(item.image?.url ? { thumbnail: item.image.url } : {}),
      }));
  }
}
