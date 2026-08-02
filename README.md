# degoog-scruffy

A personal collection of extensions for [degoog](https://github.com/degoog-org/degoog) search.

Add this repository in your degoog instance under **Settings → Store → Add repository**, then install the extensions you want.

## Engines

All engines call the [Kagi Search API](https://help.kagi.com/kagi/api/search.html) (`POST /api/v1/search`) and each needs a **Kagi API key**. Create one at [kagi.com/settings?p=api](https://kagi.com/settings?p=api) and paste it into the engine settings. The key is marked as a secret and is never sent to the browser (`isClientExposed = false`).

> **Cost:** every real request to a Kagi engine is billed against your Kagi API balance. Leave these engines out of your default engine set and use them on demand as bangs.

| Engine | Bang | Kagi workflow | degoog category |
| --- | --- | --- | --- |
| Kagi | `!kagi` | `search` | web |
| Kagi Images | `!kagiimages` | `images` | images |
| Kagi Videos | `!kagivideos` | `videos` | videos |
| Kagi News | `!kaginews` | `news` | news |
| Kagi Podcasts | `!kagipodcasts` | `podcasts` | web |

Kagi exposes no maps workflow through this API.

## Request safeguards

All five engines share one in-memory request guard inside the degoog process:

- Identical requests are deduplicated for 60 seconds.
- Parallel identical requests share the same Promise and produce one outbound API call.
- Successful, empty, failed, and rejected requests remain deduplicated for the same 60-second window.
- At most 60 real Kagi API calls are allowed in a rolling one-hour window across all five engines.
- Once the hourly guard is reached, requests fail closed and return no Kagi results instead of calling the API.
- There is no retry loop inside these extensions.

The guard is deliberately in-memory. Restarting degoog resets its counters and cache. Kagi's own spending cap remains the final billing boundary.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| API Key | — | Required. From kagi.com/settings?p=api |
| Results per page | 10 (20 for Images) | Kagi allows 1–1024 |
| Safe Search | on | Filter explicit content |

Pagination is capped at page 10. Every additional page is a separate API request. The time filter is not used because the Search API exposes no freshness parameter.

## Recommended use

Install only the engines you need, keep them disabled in the normal default engine set, and call them explicitly with their bangs. Use a dedicated Kagi API key restricted to Search where possible and configure a low Kagi spending cap while testing.
