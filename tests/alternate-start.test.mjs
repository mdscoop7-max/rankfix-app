import test from "node:test";
import assert from "node:assert/strict";
import { pickAlternateStartUrls, sitemapUrlsFromRobots } from "../lib/alternate-start.ts";
test("alternate start: same-host content pages only, no legal/account/cart/assets", () => {
  const urls = ["https://www.x.test/privacy", "https://www.x.test/cart", "https://other.test/categorie/a", "https://www.x.test/a/b/c/d/e", "https://www.x.test/img/a.jpg", "https://www.x.test/over-ons", "https://www.x.test/categorie/jassen", "https://www.x.test/blog/post?id=1"];
  assert.deepEqual(pickAlternateStartUrls(urls, "x.test", 2), ["https://www.x.test/over-ons", "https://www.x.test/categorie/jassen"]);
  assert.deepEqual(sitemapUrlsFromRobots("Sitemap: https://www.x.test/s.xml\nSitemap: https://evil.test/s.xml", "https://www.x.test"), ["https://www.x.test/s.xml", "https://www.x.test/sitemap.xml", "https://www.x.test/sitemap_index.xml"]);
});
