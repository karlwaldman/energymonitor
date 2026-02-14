# EnergyMonitor Development Notes

## CRITICAL: Git Branch Rules

**NEVER merge or push to a different branch without explicit user permission.**

- If on `beta`, only push to `beta` - never merge to `main` without asking
- If on `main`, stay on `main` - never switch branches and push without asking
- NEVER merge branches without explicit request
- Pushing to the CURRENT branch after commits is OK when continuing work

## Critical: RSS Proxy Allowlist

When adding new RSS feeds in `src/config/feeds.ts`, you **MUST** also add the feed domains to the allowlist in `api/rss-proxy.js`.

### Why

The RSS proxy has a security allowlist (`ALLOWED_DOMAINS`) that blocks requests to domains not explicitly listed. Feeds from unlisted domains will return HTTP 403 "Domain not allowed" errors.

### How to Add New Feeds

1. Add the feed to `src/config/feeds.ts`
2. Extract the domain from the feed URL
3. Add the domain to `ALLOWED_DOMAINS` array in `api/rss-proxy.js`
4. Deploy changes to Vercel

### Debugging Feed Issues

If a panel shows "No news available":

1. Open browser DevTools -> Console
2. Look for `HTTP 403` or "Domain not allowed" errors
3. Check if the domain is in `api/rss-proxy.js` allowlist

## Site Variants

Two variants controlled by `VITE_VARIANT` environment variable:

- `energy` (default): Energy + military intelligence - energy-monitor.app
- `full`: Full geopolitical focus

### Running Locally

```bash
npm run dev          # Energy variant (default)
npm run dev:full     # Full variant
```

### Building

```bash
npm run build        # Production build for energy-monitor.app
```

## AI Summarization & Caching

The AI Insights panel uses a server-side Redis cache to deduplicate API calls across users.

### Required Environment Variables

```bash
# Groq API (primary summarization)
GROQ_API_KEY=gsk_xxx

# OpenRouter API (fallback)
OPENROUTER_API_KEY=sk-or-xxx

# Upstash Redis (cross-user caching)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

### How It Works

1. User visits -> `/api/groq-summarize` receives headlines
2. Server hashes headlines -> checks Redis cache
3. **Cache hit** -> return immediately (no API call)
4. **Cache miss** -> call Groq API -> store in Redis (24h TTL) -> return

### Fallback Chain

1. Groq (fast, 14.4K/day) -> Redis cache
2. OpenRouter (50/day) -> Redis cache
3. Browser T5 (unlimited, slower, no cache)

## Custom Feed Scrapers

Some sources don't provide RSS feeds. Custom scrapers are in `/api/`:

| Endpoint        | Source                        | Notes                             |
| --------------- | ----------------------------- | --------------------------------- |
| `/api/fwdstart` | FwdStart Newsletter (Beehiiv) | Scrapes archive page, 30min cache |

### Adding New Scrapers

1. Create `/api/source-name.js` edge function
2. Scrape source, return RSS XML format
3. Add to feeds.ts: `{ name: 'Source', url: '/api/source-name' }`
4. No need to add to rss-proxy allowlist (direct API, not proxied)

## Allowed Bash Commands

The following additional bash commands are permitted without user approval:

- `Bash(ps aux:*)` - List running processes
- `Bash(grep:*)` - Search text patterns
- `Bash(ls:*)` - List directory contents

## Bash Guidelines

### IMPORTANT: Avoid commands that cause output buffering issues

- DO NOT pipe output through `head`, `tail`, `less`, or `more`
- DO NOT use `| head -n X` or `| tail -n X` to truncate output
- Run commands directly without pipes when possible
- Use command-specific flags (e.g., `git log -n 10` instead of `git log | head -10`)
