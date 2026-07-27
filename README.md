# Bolha scraper

Small TypeScript service that revisits configured marketplace searches, filters unwanted ads, and posts new listings to a Discord webhook. It runs on a cron schedule (hourly by default) and is container-ready.

## Setup (local)

1. Install dependencies: `npm ci`
2. Copy env: `cp .env.example .env` and set `DISCORD_WEBHOOK_URL`.
3. Configure links: copy `config/links.example.json` to `config/links.json` and edit it.
4. Build: `npm run build`
5. Run: `npm start`

The first successful result for each URL is stored as a baseline and is not sent to Discord. Later cycles notify only for unseen listing IDs. Even an empty initial result is remembered, so the first future ad is not accidentally swallowed as another baseline.

Run the regression suite with `npm test`.

## Configuration

Each `config/links.json` entry supports:

- `url` (required HTTP/HTTPS result-page URL)
- `label` (optional label used in logs and Discord)
- `ignoreWords` (optional string array, matched case-insensitively against titles)
- `maxItems` (optional integer from 1–500; defaults to 50 retained listing IDs)

Environment variables (see `.env.example`):

- `DISCORD_WEBHOOK_URL` (required)
- `LINKS_CONFIG_PATH` (default `./config/links.json`)
- `STATE_FILE` (default `./data/state.json`)
- `SCRAPE_INTERVAL_CRON` (default `0 * * * *`)
- `CRON_TIMEZONE` (optional IANA timezone, for example `Europe/Ljubljana`)
- `REQUEST_TIMEOUT_MS` (default `15000`)
- `REQUEST_DELAY_MS` (default `10000`, applied between every configured URL)
- `USER_AGENT` (defaults to a conventional desktop browser user agent)

## Docker

```
docker build -t bolha-scraper .
docker run \
  -e DISCORD_WEBHOOK_URL=YOUR_WEBHOOK \
  -v $(pwd)/config:/app/config:ro \
  -v $(pwd)/data:/app/data \
  bolha-scraper
```

### Docker Compose

```
docker compose up --build -d
```

Compose uses `.env`, mounts `./config` read-only, and persists state in `./data`. The image deliberately excludes the local `.env`, search configuration, and state from its build context.

## Failure behavior

- Seen IDs are written atomically to `data/state.json`; mount that directory to retain history across restarts.
- A Discord batch is marked seen only after Discord accepts it. Failed batches are retried on the next cycle.
- CAPTCHA pages and unrecognized result markup are logged as errors instead of silently being treated as empty searches.
- Some marketplaces actively block automated requests. A browser user agent may help with basic filtering, but the scraper does not bypass CAPTCHA challenges. Keep a reasonable request delay and follow each site's terms.
