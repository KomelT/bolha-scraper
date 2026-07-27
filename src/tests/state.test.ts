import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { findNewListings } from "../listing-state";
import { StateStore } from "../state";
import { Listing } from "../types";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bolha-state-test-"));
const statePath = path.join(directory, "state.json");

after(() => fs.rmSync(directory, { recursive: true, force: true }));

test("distinguishes a stored empty baseline from an unseen link", () => {
  const state = new StateStore(statePath);
  assert.equal(state.isInitialized("https://example.com/search"), false);

  state.remember("https://example.com/search", []);

  const reloaded = new StateStore(statePath);
  assert.equal(reloaded.isInitialized("https://example.com/search"), true);
  assert.deepEqual(reloaded.get("https://example.com/search"), []);
});

test("adds unique IDs and retains only the configured number", () => {
  const state = new StateStore(statePath);
  state.remember("link", ["old-1", "old-2"]);
  state.add("link", ["new", "old-1"], 3);

  assert.deepEqual(state.get("link"), ["new", "old-1", "old-2"]);
});

test("migrates legacy URL IDs without reporting known ads again", () => {
  const linkUrl = "https://www.bolha.com/search/?keywords=test";
  const known: Listing = {
    id: "15255434",
    title: "Known",
    url: "https://www.bolha.com/item/known-oglas-15255434",
    sourceLink: linkUrl,
  };
  const fresh: Listing = {
    id: "15255435",
    title: "Fresh",
    url: "https://www.bolha.com/item/fresh-oglas-15255435",
    sourceLink: linkUrl,
  };
  const state = new StateStore(statePath);
  state.remember(linkUrl, [known.url]);

  const newListings = findNewListings(state, linkUrl, [known, fresh], 10);

  assert.deepEqual(newListings, [fresh]);
  assert.equal(state.has(linkUrl, known.id), true);
});
