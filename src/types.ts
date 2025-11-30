export type LinkConfig = {
  label?: string;
  url: string;
  ignoreWords?: string[];
  maxItems?: number;
};

export type ConfigFile = {
  links: LinkConfig[];
};

export type Listing = {
  id: string;
  title: string;
  url: string;
  price?: string;
  sourceLink: string;
};

export type ScrapeResult = {
  link: LinkConfig;
  listings: Listing[];
};

export type SeenState = Record<string, string[]>;
