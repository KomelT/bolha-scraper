import axios from "axios";
import { Cheerio, load } from "cheerio";
import { AnyNode } from "domhandler";
import { LinkConfig, Listing, ScrapeResult } from "./types";

export type ScraperOptions = {
  requestTimeoutMs: number;
  userAgent: string;
};

const ITEM_SELECTORS = [
  "article[data-id]",
  "article[data-adid]",
  "article[data-listing-id]",
  "li.EntityList-item",
  "div.EntityList-item",
  "article.ad",
  "div[data-entity-id]",
];

const TITLE_SELECTORS = ["h2", "h3", ".title", ".EntityList-item-title"];
const PRICE_SELECTORS = [".price", ".Price", ".adPrice", ".entity-pricetag", "[itemprop=price]"];

export async function scrapeLink(link: LinkConfig, opts: ScraperOptions): Promise<ScrapeResult> {
  const response = await axios.get(link.url, {
    headers: {
      "User-Agent": opts.userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,sl;q=0.8",
      Referer: "https://www.google.com/",
    },
    timeout: opts.requestTimeoutMs,
    responseType: "text",
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const html = response.data as string;
  if (/Radware Bot Manager Captcha/i.test(html)) {
    throw new Error("bolha.si responded with a bot manager challenge (captcha).");
  }

  const lowerHtml = html.toLowerCase();
  const emptyMarkers = [
    "trenutno ni rezultatov za iskanje",
    "ostali oglasi, ki bi te lahko zanimali",
    "trenutno nema rezultata za pretragu",
    "ostali oglasi koji bi te mogli zanimati",
  ];
  if (emptyMarkers.some((marker) => lowerHtml.includes(marker))) {
    return { link, listings: [] };
  }

  const listings = parseListings(extractRelevantSection(html), link.url);
  const filtered = filterListings(listings, link.ignoreWords || []);

  return { link, listings: filtered.slice(0, link.maxItems || 50) };
}

function parseListings(html: string, sourceLink: string): Listing[] {
  const $ = load(html);
  let nodes: Cheerio<AnyNode> | null = null;
  for (const selector of ITEM_SELECTORS) {
    const found = $(selector);
    if (found.length > 0) {
      nodes = found;
      break;
    }
  }

  if (!nodes) {
    nodes = $("a[href*=\"/oglas\"], a[href*=\"/oglasi\"]"); // fallback
  }

  const seen = new Set<string>();
  const results: Listing[] = [];

  nodes.each((_: number, el: AnyNode) => {
    const root = $(el);
    const anchor = root.is("a") ? root : root.find("a[href]").first();
    const href = anchor.attr("href");
    if (!href) return;

    const url = normalizeUrl(href, sourceLink);
    const title = extractText(root, anchor);
    if (!title) return;

    const price = extractPrice(root);
    const id = deriveId(root, url);
    const uniqueKey = id || url;
    if (seen.has(uniqueKey)) return;
    seen.add(uniqueKey);

    results.push({ id: uniqueKey, title, url, price, sourceLink });
  });

  return results;
}

function extractText(root: Cheerio<AnyNode>, anchor: Cheerio<AnyNode>): string {
  for (const selector of TITLE_SELECTORS) {
    const text = root.find(selector).first().text().trim();
    if (text) return text;
  }
  const anchorText = anchor.text().trim();
  return anchorText;
}

function extractPrice(root: Cheerio<AnyNode>): string | undefined {
  for (const selector of PRICE_SELECTORS) {
    const text = root.find(selector).first().text().trim();
    if (text) return text;
  }
  return undefined;
}

function deriveId(root: Cheerio<AnyNode>, url: string): string {
  const dataAttrs = ["data-id", "data-adid", "data-listing-id", "data-entity-id"];
  for (const attr of dataAttrs) {
    const val = root.attr(attr);
    if (val) return val;
  }
  const match = url.match(/(\\d{5,})/);
  if (match) return match[1];
  return url;
}

function normalizeUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function filterListings(listings: Listing[], ignoreWords: string[]): Listing[] {
  if (ignoreWords.length === 0) return listings;
  const lowerWords = ignoreWords.map((w) => w.toLowerCase());
  return listings.filter((listing) => {
    const title = listing.title.toLowerCase();
    return !lowerWords.some((word) => word && title.includes(word));
  });
}

function extractRelevantSection(html: string): string {
  const lower = html.toLowerCase();
  const start = lower.indexOf("oglasi na bolha.com");
  if (start === -1) return html;
  const end = lower.indexOf("zadnji oglasi", start + 1);
  if (end === -1) return html;
  return html.slice(start, end);
}
