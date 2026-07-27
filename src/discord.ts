import axios from "axios";
import { Listing, ScrapeResult } from "./types";

type DiscordEmbed = {
  title: string;
  url: string;
  description?: string;
};

type BatchDelivered = (listings: Listing[]) => void | Promise<void>;

export async function sendToDiscord(
  webhookUrl: string,
  result: ScrapeResult,
  onBatchDelivered?: BatchDelivered
): Promise<void> {
  if (result.listings.length === 0) return;

  const batches = chunk(result.listings, 10);
  for (const listings of batches) {
    const embeds: DiscordEmbed[] = listings.map((listing) => ({
      title: truncate(listing.title, 256),
      url: listing.url,
      description: truncate(
        [listing.price, `Source: ${result.link.label || result.link.url}`]
          .filter(Boolean)
          .join(" · "),
        4096
      ),
    }));

    await axios.post(
      webhookUrl,
      {
        content: truncate(`New ads on ${result.link.label || result.link.url}`, 2000),
        embeds,
      },
      { timeout: 10000 }
    );
    await onBatchDelivered?.(listings);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    res.push(items.slice(i, i + size));
  }
  return res;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}
