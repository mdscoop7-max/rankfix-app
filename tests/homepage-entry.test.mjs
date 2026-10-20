import test from "node:test";
import assert from "node:assert/strict";
import { rootLandingCandidates, isRicherRootLanding } from "../lib/homepage-entry.ts";
import { validatePublicHttpUrl } from "../lib/safe-fetch.ts";

const gateway = '<html><head><title>redirect</title><meta http-equiv="refresh" content="0;url=/nl"></head><body>Welkom</body></html>';
const contentPage = '<html><head><title>Over ons ziekenhuis</title></head><body><main><h2>Zorg en onderzoek</h2>' + "Wij bieden medische zorg onderzoek en onderwijs. ".repeat(110) + '</main></body></html>';

test("domain-only www and http(s) inputs are valid public scan URLs", () => {
  for (const input of ["www.voorbeeld.nl", "voorbeeld.nl", "http://www.voorbeeld.nl", "https://www.voorbeeld.nl"]) {
    const url = validatePublicHttpUrl(/^https?:\/\//.test(input) ? input : "https://" + input);
    assert.equal(url.pathname, "/");
    assert.ok(url.hostname.endsWith("voorbeeld.nl"));
  }
});

test("HTTP-200 language gateway finds richer first-party homepage", () => {
  for (const base of ["https://voorbeeld.nl/", "https://www.voorbeeld.nl/", "http://voorbeeld.nl/"]) {
    assert.equal(rootLandingCandidates(new URL(base), gateway, "nl")[0].href, new URL("/nl", base).href);
  }
  assert.equal(isRicherRootLanding(gateway, contentPage), true);
  assert.equal(isRicherRootLanding(gateway, gateway), false);
});

test("do not rewrite inner pages or content-rich root homepages", () => {
  assert.deepEqual(rootLandingCandidates(new URL("https://voorbeeld.nl/nl/contact"), gateway, "nl"), []);
  assert.deepEqual(rootLandingCandidates(new URL("https://voorbeeld.nl/"), contentPage, "nl"), []);
});

test("ignore off-site language-gateway candidates", () => {
  const suspicious = '<html><title>redirect</title><meta http-equiv="refresh" content="0;url=https://example.org/nl"></html>';
  const candidates = rootLandingCandidates(new URL("https://voorbeeld.nl/"), suspicious, "nl");
  assert.deepEqual(candidates.map(candidate => candidate.pathname), ["/nl"]);
  assert.ok(candidates.every(candidate => candidate.origin === "https://voorbeeld.nl"));
});
