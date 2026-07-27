import { StateStore } from "./state";
import { Listing } from "./types";

export function findNewListings(
  state: StateStore,
  linkUrl: string,
  listings: Listing[],
  maxItems: number
): Listing[] {
  const newListings = listings.filter(
    (item) => !state.has(linkUrl, item.id) && !state.has(linkUrl, item.url)
  );

  // Older versions stored full URLs because their numeric-ID regex was broken.
  const migratedIds = listings
    .filter(
      (item) =>
        item.id !== item.url && !state.has(linkUrl, item.id) && state.has(linkUrl, item.url)
    )
    .map((item) => item.id);
  if (migratedIds.length > 0) {
    state.add(linkUrl, migratedIds, maxItems);
  }

  return newListings;
}
