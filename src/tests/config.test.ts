import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadConfig } from "../config";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bolha-config-test-"));
const configPath = path.join(directory, "links.json");
fs.writeFileSync(
  configPath,
  JSON.stringify({ links: [{ url: "https://www.bolha.com/search/?keywords=test" }] }),
  "utf8"
);

const envKeys = [
  "DISCORD_WEBHOOK_URL",
  "LINKS_CONFIG_PATH",
  "STATE_FILE",
  "SCRAPE_INTERVAL_CRON",
  "CRON_TIMEZONE",
  "REQUEST_TIMEOUT_MS",
  "REQUEST_DELAY_MS",
  "USER_AGENT",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

after(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(directory, { recursive: true, force: true });
});

test("reads and validates environment settings when loadConfig is called", () => {
  process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test/test";
  process.env.LINKS_CONFIG_PATH = configPath;
  process.env.STATE_FILE = path.join(directory, "state.json");
  process.env.SCRAPE_INTERVAL_CRON = "*/15 * * * *";
  process.env.CRON_TIMEZONE = "Europe/Ljubljana";
  process.env.REQUEST_TIMEOUT_MS = "12345";
  process.env.REQUEST_DELAY_MS = "250";
  process.env.USER_AGENT = "Configured test agent";

  const config = loadConfig();

  assert.equal(config.cron, "*/15 * * * *");
  assert.equal(config.cronTimezone, "Europe/Ljubljana");
  assert.equal(config.requestTimeoutMs, 12345);
  assert.equal(config.requestDelayMs, 250);
  assert.equal(config.userAgent, "Configured test agent");
  assert.equal(config.links[0].maxItems, 50);
});

test("rejects invalid numeric environment settings", () => {
  process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test/test";
  process.env.LINKS_CONFIG_PATH = configPath;
  process.env.REQUEST_TIMEOUT_MS = "not-a-number";

  assert.throws(() => loadConfig(), /REQUEST_TIMEOUT_MS must be an integer/);
});
