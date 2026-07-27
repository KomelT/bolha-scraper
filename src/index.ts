import dotenv from "dotenv";
import cron from "node-cron";
import { loadConfig } from "./config";
import { sendToDiscord } from "./discord";
import { findNewListings } from "./listing-state";
import { scrapeLink } from "./scraper";
import { StateStore } from "./state";

dotenv.config();

async function main() {
  const config = loadConfig();
  const state = new StateStore(config.stateFile);
  let cycleRunning = false;

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const run = async () => {
    if (cycleRunning) {
      console.warn(`[${new Date().toISOString()}] Previous scrape cycle is still running; skipping.`);
      return;
    }

    cycleRunning = true;
    console.log(`[${new Date().toISOString()}] Starting scrape cycle...`);
    try {
      for (let index = 0; index < config.links.length; index += 1) {
        const link = config.links[index];
        const maxItems = link.maxItems ?? 50;
        try {
          const result = await scrapeLink(link, {
            requestTimeoutMs: config.requestTimeoutMs,
            userAgent: config.userAgent,
          });

          if (!state.isInitialized(link.url)) {
            state.remember(
              link.url,
              result.listings.map((item) => item.id).slice(0, maxItems)
            );
            console.log(`Baseline stored for ${link.label}; skipping initial notification.`);
            continue;
          }

          const newListings = findNewListings(state, link.url, result.listings, maxItems);

          if (newListings.length === 0) {
            console.log(`No new items for ${link.label}`);
            continue;
          }

          const stateBeforeDelivery = state.get(link.url);
          const deliveredIds: string[] = [];
          await sendToDiscord(
            config.discordWebhook,
            { ...result, listings: newListings },
            (delivered) => {
              deliveredIds.push(...delivered.map((item) => item.id));
              const retainedIds = Array.from(
                new Set([...deliveredIds, ...stateBeforeDelivery])
              ).slice(0, maxItems);
              state.remember(link.url, retainedIds);
            }
          );
          console.log(`Reported ${newListings.length} new items for ${link.label}`);
        } catch (err) {
          console.error(
            `Failed to process ${link.label}:`,
            err instanceof Error ? err.message : err
          );
        } finally {
          if (index < config.links.length - 1 && config.requestDelayMs > 0) {
            await sleep(config.requestDelayMs);
          }
        }
      }
    } finally {
      cycleRunning = false;
      console.log(`[${new Date().toISOString()}] Cycle finished.`);
    }
  };

  await run();
  cron.schedule(config.cron, () => void run(), {
    timezone: config.cronTimezone,
  });
  console.log(
    `Scheduled with "${config.cron}"${config.cronTimezone ? ` (${config.cronTimezone})` : ""}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
