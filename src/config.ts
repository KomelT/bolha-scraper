import fs from "fs";
import path from "path";
import cron from "node-cron";
import { ConfigFile, LinkConfig } from "./types";

export type AppConfig = {
  discordWebhook: string;
  links: LinkConfig[];
  stateFile: string;
  cron: string;
  cronTimezone?: string;
  requestTimeoutMs: number;
  requestDelayMs: number;
  userAgent: string;
};

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export function loadConfig(): AppConfig {
  const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
  if (!discordWebhook) {
    throw new Error("DISCORD_WEBHOOK_URL missing in environment.");
  }

  const configPath = path.resolve(process.env.LINKS_CONFIG_PATH || "config/links.json");
  const stateFile = path.resolve(process.env.STATE_FILE || "data/state.json");
  const schedule = process.env.SCRAPE_INTERVAL_CRON || "0 * * * *";
  const cronTimezone = process.env.CRON_TIMEZONE || undefined;
  const requestTimeoutMs = readPositiveInteger("REQUEST_TIMEOUT_MS", 15000);
  const requestDelayMs = readNonNegativeInteger("REQUEST_DELAY_MS", 10000);

  if (!cron.validate(schedule)) {
    throw new Error(`SCRAPE_INTERVAL_CRON is not a valid cron expression: ${schedule}`);
  }
  if (cronTimezone) {
    validateTimezone(cronTimezone);
  }

  let parsed: ConfigFile;
  try {
    const fileRaw = fs.readFileSync(configPath, "utf-8");
    parsed = JSON.parse(fileRaw) as ConfigFile;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read links config at ${configPath}: ${reason}`);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray(parsed.links) ||
    parsed.links.length === 0
  ) {
    throw new Error(`${configPath} is missing a non-empty \`links\` array.`);
  }

  const links = parsed.links.map((link, index) => validateLink(link, index));

  return {
    discordWebhook,
    links,
    stateFile,
    cron: schedule,
    cronTimezone,
    requestTimeoutMs,
    requestDelayMs,
    userAgent: process.env.USER_AGENT?.trim() || DEFAULT_USER_AGENT,
  };
}

function validateLink(link: LinkConfig, index: number): LinkConfig {
  const prefix = `links[${index}]`;
  if (!link || typeof link !== "object" || typeof link.url !== "string" || !link.url.trim()) {
    throw new Error(`${prefix}.url must be a non-empty URL.`);
  }

  let url: URL;
  try {
    url = new URL(link.url);
  } catch {
    throw new Error(`${prefix}.url is not a valid URL: ${link.url}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${prefix}.url must use http or https.`);
  }
  if (link.label !== undefined && typeof link.label !== "string") {
    throw new Error(`${prefix}.label must be a string.`);
  }
  if (link.ignoreWords !== undefined && !isStringArray(link.ignoreWords)) {
    throw new Error(`${prefix}.ignoreWords must be an array of strings.`);
  }
  if (
    link.maxItems !== undefined &&
    (!Number.isInteger(link.maxItems) || link.maxItems < 1 || link.maxItems > 500)
  ) {
    throw new Error(`${prefix}.maxItems must be an integer between 1 and 500.`);
  }

  return {
    label: link.label?.trim() || link.url,
    url: link.url,
    ignoreWords: (link.ignoreWords || []).map((word) => word.trim()).filter(Boolean),
    maxItems: link.maxItems ?? 50,
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = readInteger(name, fallback);
  if (value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function readNonNegativeInteger(name: string, fallback: number): number {
  const value = readInteger(name, fallback);
  if (value < 0) throw new Error(`${name} must be a non-negative integer.`);
  return value;
}

function readInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer.`);
  return value;
}

function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new Error(`CRON_TIMEZONE is not a valid IANA timezone: ${timezone}`);
  }
}
