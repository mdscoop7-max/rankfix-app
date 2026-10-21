import test from "node:test";
import assert from "node:assert/strict";
import { classifyDiscoveredLinkHref, classifyLinkAuditInputs } from "../lib/link-audit-evidence.ts";

test("unresolved CMS/framework template hrefs are not tested as proven broken destinations", () => {
  const hrefs = [
    "$parent.collectionPersonalPageUrl",
    "/$scope.route.destination",
    "${product.link}",
    "/products/{{ product.slug }}",
    "<%= destination %>",
    "/%24parent.collectionPersonalPageUrl",
    "/%7B%7Bcollection.url%7D%7D",
  ];
  for (const href of hrefs) {
    assert.equal(classifyDiscoveredLinkHref(href), "template_unresolved", href);
  }
  const links = hrefs.map(sourceHref => ({ sourceHref }));
  const { actionable, unresolvedTemplates } = classifyLinkAuditInputs(links);
  assert.equal(actionable.length, 0);
  assert.equal(unresolvedTemplates.length, hrefs.length);
});

test("ordinary public URLs, dollar paths and literal broken links retain audit eligibility", () => {
  const links = [
    "/missing-page", "https://voorbeeld.nl/foo", "/book/$5-deal",
    "/api?ref=$parent.collection", "/euro-€-en-dollar-$",
    "/help#section", "/products?id=123", "/products/42.json",
  ].map(sourceHref => ({ sourceHref }));
  const classified = classifyLinkAuditInputs(links);
  assert.equal(classified.actionable.length, links.length);
  assert.equal(classified.unresolvedTemplates.length, 0);
});

test("only uncertain entries are removed; normal destinations remain in original sample order", () => {
  const a = [
    {sourceHref: "/real-404", id:1},
    {sourceHref: "$parent.collectionPersonalPageUrl", id:2},
    {sourceHref: "/redirect", id:3},
  ];
  const { actionable, unresolvedTemplates } = classifyLinkAuditInputs(a);
  assert.deepEqual(actionable.map(x=>x.id), [1,3]);
  assert.deepEqual(unresolvedTemplates.map(x=>x.id), [2]);
});
