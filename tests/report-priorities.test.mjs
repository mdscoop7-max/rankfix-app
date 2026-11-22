import test from "node:test";
import assert from "node:assert/strict";
import { factImprovements, oneSentence, topImprovements } from "../lib/report-priorities.ts";

const checks = [
  { key: "title", title: "Meta title", status: "warning", severity: "MEDIUM", message: "De title is 27 tekens. Richtwaarde 30–60.", fix: "Herschrijf de title. Gebruik merk en onderwerp.", points: 8, maxPoints: 10 },
  { key: "https", title: "HTTPS", status: "fail", severity: "CRITICAL", message: "De pagina gebruikt geen HTTPS.", fix: "Activeer HTTPS.", points: 0, maxPoints: 10 },
  { key: "h1", title: "H1-heading", status: "pass", message: "Er is één H1." },
  { key: "faq", title: "Vraag & antwoord", status: "unable_to_confirm", message: "Niet te bevestigen." },
  { key: "alt", title: "Alt-teksten", status: "warning", severity: "LOW", message: "3 afbeeldingen zonder alt.", fix: "Voeg alt-teksten toe.", points: 3, maxPoints: 5 },
  { key: "canonical", title: "Canonical", status: "fail", severity: "HIGH", message: "Canonical verwijst naar een 404.", fix: "Verwijs naar de juiste URL.", points: 0, maxPoints: 8 },
];

test("short report: only proven issues, most severe first, one sentence each", () => {
  const top = topImprovements(checks);
  assert.deepEqual(top.map((i) => [i.title, i.severity]), [["HTTPS", "Hoog"], ["Canonical", "Hoog"], ["Meta title", "Middel"], ["Alt-teksten", "Laag"]]);
  assert.equal(top[2].problem, "De title is 27 tekens.");
  assert.equal(top[2].fix, "Herschrijf de title.");
  // Passes and unconfirmed checks never appear as problems.
  assert.ok(!top.some((i) => i.title === "H1-heading" || i.title === "Vraag & antwoord"));
});

test("short report: limited to five, without duplicates", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ title: `Check ${i}`, status: "warning", severity: "MEDIUM", message: "x.", maxPoints: 5, points: 2 }));
  assert.equal(topImprovements([...many, many[0]]).length, 5);
});

test("short report: proven missing facts join the list, unconfirmed facts do not", () => {
  const facts = [
    { key: "company_registration", label: "Bedrijfsregistratie (KvK/btw)", state: "missing", detail: "Geen KvK- of btw-nummer gevonden op de onderzochte pagina's (/, /contact)." },
    { key: "contact", label: "Contactgegevens", state: "not_confirmed", detail: "Niet gevonden." },
  ];
  const extra = factImprovements(facts);
  assert.deepEqual(extra.map((i) => [i.title, i.severity]), [["Bedrijfsregistratie (KvK/btw) ontbreekt", "Middel"]]);
  assert.match(extra[0].fix, /KvK- en btw-nummer/);
  const top = topImprovements(checks, extra);
  assert.deepEqual(top.map((i) => i.title).slice(0, 4), ["HTTPS", "Canonical", "Meta title", "Bedrijfsregistratie (KvK/btw) ontbreekt"]);
});

test("short report: sentences are trimmed for readability", () => {
  assert.equal(oneSentence("Eén. Twee."), "Eén.");
  assert.equal(oneSentence("www.example.nl gebruikt geen HTTPS"), "www.example.nl gebruikt geen HTTPS");
  assert.ok(oneSentence("woord ".repeat(80), 60).length <= 60);
  assert.equal(oneSentence(undefined), "");
});

test("report page: top improvements and essential facts come first, technical blocks after the actions", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx", import.meta.url), "utf8");
  const at = (needle) => { const i = page.indexOf(needle); assert.ok(i > 0, needle); return i; };
  const priorities = at('className="report-priorities"');
  assert.ok(priorities < at("Website Speed — mobiel en desktop"));
  assert.ok(priorities < at("<h2>{ux.mainProblems}</h2>"));
  assert.ok(at("<h2>{ux.actions}</h2>") < at("<h2>{deep.basis}</h2>"));
  assert.ok(at("<h2>{ux.actions}</h2>") < at("Scoreweging en puntenaftrek"));
  assert.match(page, /topImprovements\(checks,factImprovements\(essentialFactRows\)\)/);
});
