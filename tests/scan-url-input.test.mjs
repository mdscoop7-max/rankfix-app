import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScanUrlInput } from "../lib/scan-url-input.ts";

test("copied Rijksmuseum domain loses the invisible trailing word joiner", () => {
  const input = "https://www.rijksmuseum.nl/" + String.fromCodePoint(0x2060);
  const normalized = normalizeScanUrlInput(input);
  assert.equal(normalized, "https://www.rijksmuseum.nl/");
  assert.equal(new URL(normalized).pathname, "/");
  assert.notEqual(new URL(input).pathname, "/");
});

test("bare and www domains with invisible copy artifacts normalize", () => {
  const artifacts = [0x2060, 0x200b, 0x200c, 0x200d, 0xfeff];
  for (const code of artifacts) {
    const z = String.fromCodePoint(code);
    assert.equal(normalizeScanUrlInput(z + "rijksmuseum.nl" + z), "rijksmuseum.nl");
    assert.equal(normalizeScanUrlInput("  www.rijksmuseum.nl" + z), "www.rijksmuseum.nl");
    assert.equal(normalizeScanUrlInput("http://www.rijksmuseum.nl/" + z), "http://www.rijksmuseum.nl/");
  }
});

test("legitimate interior Unicode in an internationalized path remains intact", () => {
  const input = "https://voorbeeld.nl/abc" + String.fromCodePoint(0x200c) + "def";
  assert.equal(normalizeScanUrlInput(input), input);
});

test("normal URLs are unchanged", () => {
  const input = "https://www.amsterdamumc.nl/nl";
  assert.equal(normalizeScanUrlInput(input), input);
});
