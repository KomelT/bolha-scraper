import dotenv from "dotenv";
import cron from "node-cron";
import { loadConfig } from "./config";
import { sendToDiscord } from "./discord";
import { scrapeLink } from "./scraper";
import { StateStore } from "./state";
import { Listing, LinkConfig } from "./types";

dotenv.config();

async function main() {
  const config = loadConfig();
  const state = new StateStore(config.stateFile);

  const run = async () => {
    console.log(`[${new Date().toISOString()}] Starting scrape cycle...`);
    for (const link of config.links) {
      try {
        const result = await scrapeLink(link, {
          requestTimeoutMs: config.requestTimeoutMs,
          userAgent: config.userAgent,
        });
        const existingIds = state.get(link.url);
        const isInitialForLink = existingIds.length === 0;
        const newListings = result.listings.filter((item) => !state.has(link.url, item.id));

        if (isInitialForLink) {
          const baselineIds = result.listings.map((i) => i.id).slice(0, link.maxItems || 50);
          state.remember(link.url, baselineIds);
          console.log(`Baseline stored for ${link.label}; skipping initial notification.`);
          continue;
        }

        if (newListings.length === 0) {
          console.log(`No new items for ${link.label}`);
          continue;
        }

        await notify(config.discordWebhook, { ...result, listings: newListings });
        const retainedIds = [...newListings.map((i) => i.id), ...state.get(link.url)].slice(
          0,
          link.maxItems || 50
        );
        state.remember(link.url, retainedIds);
        console.log(`Reported ${newListings.length} new items for ${link.label}`);
      } catch (err) {
        console.error(`Failed to scrape ${link.label}:`, err instanceof Error ? err.message : err);
      }
    }
    console.log(`[${new Date().toISOString()}] Cycle finished.`);
  };

  await run();
  cron.schedule(config.cron, run);
}

async function notify(
  webhook: string,
  payload: { listings: Listing[]; link: LinkConfig }
): Promise<void> {
  try {
    await sendToDiscord(webhook, payload);
  } catch (err) {
    console.error("Failed to send to Discord:", err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
