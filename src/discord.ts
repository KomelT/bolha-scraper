import axios from "axios";
import { Listing, ScrapeResult } from "./types";

type DiscordEmbed = {
  title: string;
  url: string;
  description?: string;
};

export async function sendToDiscord(webhookUrl: string, result: ScrapeResult) {
  if (result.listings.length === 0) return;

  const batches = chunk(result.listings, 10);
  for (const listings of batches) {
    const embeds: DiscordEmbed[] = listings.map((listing) => ({
      title: listing.title,
      url: listing.url,
      description: [listing.price, `Source: ${result.link.label || result.link.url}`]
        .filter(Boolean)
        .join(" · "),
    }));

    await axios.post(
      webhookUrl,
      { content: `New ads on ${result.link.label || result.link.url}`, embeds },
      { timeout: 10000 }
    );
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    res.push(items.slice(i, i + size));
  }
  return res;
}
