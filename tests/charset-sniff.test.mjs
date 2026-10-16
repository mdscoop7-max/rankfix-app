import test from "node:test";
import assert from "node:assert/strict";
import { readResponseTextLimited, sniffMetaCharset } from "../lib/safe-fetch.ts";

// EU sites in Central/Eastern Europe and Greece still serve legacy encodings and
// often declare them only in the document. Identity words must survive decoding.
const enc = (label, text) => {
  const tables = { "windows-1250": { "Č": 0xC8, "č": 0xE8, "ř": 0xF8, "á": 0xE1, "é": 0xE9, "š": 0x9A, "ž": 0x9E, "í": 0xED }, "iso-8859-1": { "á": 0xE1, "í": 0xED, "ã": 0xE3, "ç": 0xE7 } };
  const t = tables[label];
  return Uint8Array.from([...text].map((ch) => (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : t[ch])));
};
test("meta charset is honoured when the header has none (windows-1250, Czech)", async () => {
  const html = `<html><head><meta charset="windows-1250"><title>Zprávy a ministerstvo</title></head><body>Česká zpráva</body></html>`;
  const bytes = enc("windows-1250", html);
  assert.equal(sniffMetaCharset(bytes), "windows-1250");
  const text = await readResponseTextLimited(new Response(bytes, { headers: { "content-type": "text/html" } }));
  assert.match(text, /Zprávy a ministerstvo/);
  assert.match(text, /Česká/);
});
test("http-equiv content-type charset (ISO-8859-1, Portuguese)", async () => {
  const html = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1"><title>Rádio e Televisão - Notícias</title></head></html>`;
  const text = await readResponseTextLimited(new Response(enc("iso-8859-1", html), { headers: { "content-type": "text/html" } }));
  assert.match(text, /Rádio e Televisão - Notícias/);
  assert.ok(!text.includes("\uFFFD"));
});
test("unknown meta label falls back safely", () => {
  assert.equal(sniffMetaCharset(new TextEncoder().encode('<meta charset="no-such-charset">')), "");
});
