import axios from "axios";
import { Cheerio, load } from "cheerio";
import { AnyNode } from "domhandler";
import { LinkConfig, Listing, ScrapeResult } from "./types";

export type ScraperOptions = {
  requestTimeoutMs: number;
  userAgent: string;
};

const ITEM_SELECTORS = [
  ".EntityList-items > .EntityList-item",
  "article[data-id]",
  "article[data-adid]",
  "article[data-listing-id]",
  "li.EntityList-item",
  "div.EntityList-item",
  "article.ad",
  "div[data-entity-id]",
];

const TITLE_SELECTORS = [
  ".entity-title",
  ".EntityList-item-title",
  "[itemprop=name]",
  "[data-testid*=title]",
  "h2",
  "h3",
  ".title",
];
const PRICE_SELECTORS = [".price", ".Price", ".adPrice", ".entity-pricetag", "[itemprop=price]"];
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const EMPTY_MARKERS = [
  "trenutno ni rezultatov za iskanje",
  "ni rezultatov za iskanje",
  "trenutno nema rezultata za pretragu",
  "nema rezultata za pretragu",
  "nismo pronašli niti jedan oglas",
];
const CHALLENGE_MARKERS = [
  /radware bot manager captcha/i,
  /shieldsquare captcha/i,
  /captcha\.perfdrive\.com/i,
  /<title[^>]*>[^<]*captcha/i,
];

export async function scrapeLink(link: LinkConfig, opts: ScraperOptions): Promise<ScrapeResult> {
  const response = await axios.get(link.url, {
    headers: {
      "User-Agent": opts.userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "sl-SI,sl;q=0.9,hr;q=0.8,en;q=0.7",
    },
    timeout: opts.requestTimeoutMs,
    responseType: "text",
    maxContentLength: MAX_HTML_BYTES,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const html = response.data as string;
  return parsePage(html, link);
}

export function parsePage(html: string, link: LinkConfig): ScrapeResult {
  if (CHALLENGE_MARKERS.some((marker) => marker.test(html))) {
    throw new Error(`${hostname(link.url)} responded with a bot challenge (captcha).`);
  }
  if (isExplicitlyEmpty(html)) {
    return { link, listings: [] };
  }

  const listings = parseListings(html, link.url);
  const filtered = filterListings(listings, link.ignoreWords || []);

  if (listings.length === 0 && isBolhaSearchWithOnlyLatestAds(html, link.url)) {
    return { link, listings: [] };
  }
  if (listings.length === 0) {
    throw new Error(
      `${hostname(link.url)} returned no recognizable listings; its page markup may have changed.`
    );
  }

  return { link, listings: filtered.slice(0, link.maxItems ?? 50) };
}

export function parseListings(html: string, sourceLink: string): Listing[] {
  const $ = load(html);
  const scope = findListingScope($);
  if (!scope) return [];
  let nodes: Cheerio<AnyNode> | null = null;
  for (const selector of ITEM_SELECTORS) {
    const found = scope.find(selector);
    if (found.length > 0) {
      nodes = found;
      break;
    }
  }

  if (!nodes) {
    nodes = scope.find('a[href*="-oglas-"]');
  }

  const seen = new Set<string>();
  const results: Listing[] = [];

  nodes.each((_: number, el: AnyNode) => {
    const root = $(el);
    const anchor = root.is("a") ? root : findListingAnchor(root);
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
    const text = cleanText(root.find(selector).first().text());
    if (text) return text;
  }
  const anchorText = cleanText(anchor.text());
  return anchorText;
}

function extractPrice(root: Cheerio<AnyNode>): string | undefined {
  for (const selector of PRICE_SELECTORS) {
    const text = cleanText(root.find(selector).first().text());
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
  const match = url.match(/(?:oglas-|\/)(\d{5,})(?:[/?#]|$)/i);
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
  const lowerWords = ignoreWords.map((word) => word.trim().toLocaleLowerCase()).filter(Boolean);
  return listings.filter((listing) => {
    const title = listing.title.toLocaleLowerCase();
    return !lowerWords.some((word) => title.includes(word));
  });
}

function findListingScope($: ReturnType<typeof load>): Cheerio<AnyNode> | undefined {
  const titledGroups = $(".EntityList-groupTitle").filter((_, element) => {
    const title = cleanText($(element).text()).toLocaleLowerCase();
    return title.includes("oglasi na bolha") || title.includes("njuškalo oglasi");
  });
  const group = titledGroups.first().parent();
  if (group.length > 0) return group;

  // Bolha renders a separate "Zadnji oglasi" list when a search has no matching ads.
  // It must never become a fallback source for the configured search.
  if ($(".EntityList-groupTitle").length > 0) return undefined;

  return $.root();
}

function findListingAnchor(root: Cheerio<AnyNode>): Cheerio<AnyNode> {
  const preferred = root
    .find(
      '.entity-title a[href], .EntityList-item-title a[href], h2 a[href], h3 a[href], a[href*="-oglas-"]'
    )
    .first();
  return preferred.length > 0 ? preferred : root.find("a[href]").first();
}

function isExplicitlyEmpty(html: string): boolean {
  const lowerHtml = html.toLocaleLowerCase();
  return (
    EMPTY_MARKERS.some((marker) => lowerHtml.includes(marker)) ||
    /\b0\s+(?:oglasov|oglasa)\b/i.test(lowerHtml)
  );
}

function isBolhaSearchWithOnlyLatestAds(html: string, sourceLink: string): boolean {
  try {
    const source = new URL(sourceLink);
    if (!source.hostname.endsWith("bolha.com") || !source.pathname.startsWith("/search")) {
      return false;
    }
  } catch {
    return false;
  }

  const $ = load(html);
  const titles = $(".EntityList-groupTitle")
    .map((_, element) => cleanText($(element).text()).toLocaleLowerCase())
    .get();
  return titles.length > 0 && titles.every((title) => title.includes("zadnji oglasi"));
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
