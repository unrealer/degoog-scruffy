# degoog-scruffy

A personal collection of extensions for [degoog](https://github.com/degoog-org/degoog) search.

Add this repository in your degoog instance under **Settings → Store → Add repository**, then install the extensions you want.

## Engines

All engines call the [Kagi Search API](https://help.kagi.com/kagi/api/search.html) (`POST /api/v1/search`) and each needs a **Kagi API key** — create one at [kagi.com/settings?p=api](https://kagi.com/settings?p=api) and paste it into the engine's settings. The key is stored as a secret in degoog and is never sent to the browser (`isClientExposed = false`).

> ⚠️ **Cost:** every query to a Kagi engine is billed against your Kagi API balance. To avoid charging your balance on every degoog search, leave these out of your default engine set and use them on demand as bangs.

| Engine | Bang | Kagi workflow | degoog category |
| --- | --- | --- | --- |
| Kagi | `!kagi` | `search` | web |
| Kagi Images | `!kagiimages` | `images` | images |
| Kagi Videos | `!kagivideos` | `videos` | videos |
| Kagi News | `!kaginews` | `news` | news |
| Kagi Podcasts | `!kagipodcasts` | `podcasts` | web |

> Kagi's Search API exposes the workflows `search`, `images`, `videos`, `news`, and `podcasts` — there is **no maps workflow**, so a maps engine isn't possible against this API.

Each engine's settings:

| Setting | Default | Notes |
| --- | --- | --- |
| API Key | — | Required. From kagi.com/settings?p=api |
| Results per page | 10 (20 for Images) | Kagi allows 1–1024 |
| Safe Search | on | Filter explicit content |

Pagination is capped at page 10 (the API limit); the time filter is not used (the Search API exposes no freshness parameter).
