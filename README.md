# Bolha scraper

Small TypeScript service that revisits configured bolha.si links, filters out unwanted ads, and posts new listings to a Discord webhook. Runs on a cron schedule (default hourly) and is container-ready.

## Setup (local)
1. Install dependencies: `npm install`
2. Copy env: `cp .env.example .env` and set `DISCORD_WEBHOOK_URL`.
3. Configure links: edit `config/links.json` (see `config/links.example.json` for shape).
4. Build: `npm run build`
5. Run: `npm start`

## Config options
- `config/links.json` entries:
  - `url` (string, required)
  - `label` (string, optional, used in Discord messages)
  - `ignoreWords` (string[], optional, case-insensitive)
  - `maxItems` (number, optional, limits how many IDs we keep in state)
- Environment variables (see `.env.example`):
  - `DISCORD_WEBHOOK_URL` (required)
  - `STATE_FILE` (default `./data/state.json`)
  - `SCRAPE_INTERVAL_CRON` (default `0 * * * *` → hourly)
  - `REQUEST_TIMEOUT_MS`, `USER_AGENT` (tune fetching)

## Docker
```
docker build -t bolha-scraper .
docker run \
  -e DISCORD_WEBHOOK_URL=YOUR_WEBHOOK \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/data:/app/data \
  bolha-scraper
```

### Docker Compose
```
docker compose up --build -d
```
Uses `.env`, mounts `./config` and `./data` by default (see `docker-compose.yml`).

## Notes
- State of seen listings is persisted to `data/state.json`; mount it to keep history across container restarts.
- If bolha.si serves a captcha/bot challenge, the service logs the error. Updating `USER_AGENT` or reusing browser cookies (via custom headers) may help if that happens from your network.
