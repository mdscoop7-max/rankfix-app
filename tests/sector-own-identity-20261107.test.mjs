// Fresh144 7 Nov 2026 (engine fefd45d): two real wrong sectors.
// - rodekruis.nl -> "blog/publicaties": the homepage lists news teasers (BlogPosting).
// - megekko.nl -> "industrie": sub-page titles of the shop's product rubrics
//   ("Megekko.nl - Componenten - SSD Solid state drive") voted for manufacturing.
// Original page fields; generic rules only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectEuPrimaryIdentity } from "../lib/eu-identity.ts";
import { relevantOptions, reasoningParams } from "../lib/ai-sector-verifier.ts";

const rk = JSON.parse(readFileSync(new URL("./fixtures/fresh144-20261107/rodekruis-homepage.json", import.meta.url), "utf8"));

test("Rode Kruis homepage (real fields): aid organisation, not a publisher, although it lists BlogPosting teasers", () => {
  const r = detectEuPrimaryIdentity({ title: rk.title, description: rk.description, h1s: rk.h1s, navLabels: rk.navigationLabels, schemaTypes: rk.schemaTypes, hostname: "rodekruis.nl", homepage: true });
  assert.equal(r?.sector, "nonprofit");
  assert.notEqual(r?.key, "publisher_blog");
});

test("a real blog stays a publisher on its homepage; BlogPosting on an article page still counts", () => {
  assert.equal(detectEuPrimaryIdentity({ title: "Tech Blog | Nieuws over gadgets", description: "Het blog over gadgets en techniek", h1s: ["Laatste blogs"], schemaTypes: ["Blog", "BlogPosting"], homepage: true })?.key, "publisher_blog");
  assert.equal(detectEuPrimaryIdentity({ title: "Zo kies je een laptop", description: "Tips", h1s: ["Zo kies je een laptop"], schemaTypes: ["BlogPosting"], homepage: false })?.key, "publisher_blog");
});

test("megekko sub-pages (real titles, 5 Nov audit): a shop's product rubric is never manufacturing evidence", () => {
  for (const title of ["Megekko.nl - Componenten - SSD Solid state drive", "Megekko.nl - Componenten - Behuizingen en meer"]) {
    assert.notEqual(detectEuPrimaryIdentity({ title, description: "", h1s: [title.split(" - ").pop()], homepage: false })?.sector, "manufacturing_industrial", title);
  }
});

test("a component maker's own homepage is still recognised by rule 7c", () => {
  const r = detectEuPrimaryIdentity({ title: "Remsystemen voor auto's en fietsen | Remtech", description: "Wij ontwikkelen remsystemen en componenten als eerste montage voor autofabrikanten.", h1s: ["Remsystemen"], homepage: true });
  assert.equal(r?.sector, "manufacturing_industrial");
});

test("AI prompt only lists verifiable sectors; reasoning models get minimal/low reasoning and a bounded answer", () => {
  const options = [{ sector: "education", key: "driving_school", label: "Rijschool", vocab: [/rijschool|rijles/i] }, { sector: "hospitality", key: "hotel", label: "Hotel", vocab: [/hotel/i] }];
  assert.deepEqual(relevantOptions(options, [{ url: "u", title: "Rijschool Noord", text: "Rijles in Utrecht" }]).map((o) => o.key), ["driving_school"]);
  assert.equal(reasoningParams("gpt-5-mini", {}).reasoning_effort, "minimal");
  assert.equal(reasoningParams("gpt-5.6-luna", {}).reasoning_effort, "low");
  assert.equal(reasoningParams("gpt-4.1-mini", {}).reasoning_effort, undefined);
  assert.equal(reasoningParams("gpt-5-mini", { OPENAI_SECTOR_REASONING: "none" }).reasoning_effort, undefined);
  assert.ok(reasoningParams("gpt-5-mini", {}).max_completion_tokens > 0);
});
