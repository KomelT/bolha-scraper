import fs from "fs";
import path from "path";
import { ConfigFile, LinkConfig } from "./types";

export type AppConfig = {
  discordWebhook: string;
  links: LinkConfig[];
  stateFile: string;
  cron: string;
  requestTimeoutMs: number;
};

const DEFAULTS = {
  configPath: process.env.LINKS_CONFIG_PATH || path.resolve("config/links.json"),
  stateFile: process.env.STATE_FILE || path.resolve("data/state.json"),
  cron: process.env.SCRAPE_INTERVAL_CRON || "0 * * * *",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 15000),
};

export function loadConfig(): AppConfig {
  const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
  if (!discordWebhook) {
    throw new Error("DISCORD_WEBHOOK_URL missing in environment.");
  }

  const fileRaw = fs.readFileSync(DEFAULTS.configPath, "utf-8");
  const parsed: ConfigFile = JSON.parse(fileRaw);
  if (!parsed.links || !Array.isArray(parsed.links) || parsed.links.length === 0) {
    throw new Error("config/links.json is missing a non-empty `links` array.");
  }

  const links = parsed.links.map((link) => ({
    label: link.label || link.url,
    url: link.url,
    ignoreWords: (link.ignoreWords || []).map((w) => w.toLowerCase()),
    maxItems: link.maxItems ?? 50,
  }));

  return {
    discordWebhook,
    links,
    stateFile: DEFAULTS.stateFile,
    cron: DEFAULTS.cron,
    requestTimeoutMs: DEFAULTS.requestTimeoutMs,
  };
}
