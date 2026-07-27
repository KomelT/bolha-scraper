import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePage } from "../scraper";
import { LinkConfig } from "../types";

const link: LinkConfig = {
  label: "Weller",
  url: "https://www.bolha.com/search/?keywords=weller",
  maxItems: 30,
};

test("parses current Bolha result markup and excludes the latest-ads list", () => {
  const html = `
    <section class="EntityList">
      <h2 class="EntityList-groupTitle">Oglasi na bolha.com</h2>
      <ul class="EntityList-items">
        <li class="EntityList-item">
          <article class="entity-body">
            <h3 class="entity-title">
              <a href="/spajkalniki/weller-oglas-15255434"> Weller   spajkalnik </a>
            </h3>
            <div class="entity-prices"><strong class="price"> 40 € </strong></div>
          </article>
        </li>
      </ul>
    </section>
    <section class="EntityList">
      <h2 class="EntityList-groupTitle">Zadnji oglasi</h2>
      <ul class="EntityList-items">
        <li class="EntityList-item">
          <article><h3><a href="/drugo/nepovezan-oglas-99999999">Unrelated ad</a></h3></article>
        </li>
      </ul>
    </section>`;

  const result = parsePage(html, link);

  assert.deepEqual(result.listings, [
    {
      id: "15255434",
      title: "Weller spajkalnik",
      url: "https://www.bolha.com/spajkalniki/weller-oglas-15255434",
      price: "40 €",
      sourceLink: link.url,
    },
  ]);
});

test("filters ignored words without changing case sensitivity", () => {
  const html = `
    <article data-id="one"><h2><a href="/izdelek-oglas-100001">Weller broken</a></h2></article>
    <article data-id="two"><h2><a href="/izdelek-oglas-100002">Weller station</a></h2></article>`;

  const result = parsePage(html, { ...link, ignoreWords: ["BROKEN"] });

  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].id, "two");
});

test("accepts an explicitly empty result page", () => {
  const result = parsePage("<main>Trenutno ni rezultatov za iskanje.</main>", link);
  assert.deepEqual(result.listings, []);
});

test("never treats Bolha's latest-ads fallback as search results", () => {
  const html = `
    <section class="EntityList">
      <h2 class="EntityList-groupTitle">Zadnji oglasi</h2>
      <ul class="EntityList-items">
        <li class="EntityList-item">
          <article><h3><a href="/avto/nepovezan-oglas-99999999">Unrelated ad</a></h3></article>
        </li>
      </ul>
    </section>`;

  assert.deepEqual(parsePage(html, link).listings, []);
});

test("reports bot challenges instead of treating them as an empty search", () => {
  assert.throws(
    () => parsePage("<title>ShieldSquare Captcha</title>", link),
    /bot challenge \(captcha\)/
  );
});

test("reports unrecognized markup instead of silently returning no ads", () => {
  assert.throws(() => parsePage("<main>Unexpected response</main>", link), /markup may have changed/);
});
