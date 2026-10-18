import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyMetaDescriptionToSource, buildEvidenceDescription, extractSourceDescriptionEvidence, checkDescriptionCandidate,
  generateMetaDescription, parseAiJsonObject, normalizeDescriptionText, isTransientSeoCopy,
} from "../lib/meta-description-fix.ts";

const NEW = "Bekijk het assortiment van Voorbeeldshop: keukenspullen, tuingereedschap en opbergoplossingen, overzichtelijk per categorie geordend.";

test("new text fixture itself satisfies the 120–160 guideline", () => {
  assert.ok(NEW.length >= 120 && NEW.length <= 160, String(NEW.length));
  assert.equal(checkDescriptionCandidate(NEW).ok, true);
});

test("html: only the description content attribute changes", () => {
  const src = `<!doctype html><html><head><title>Voorbeeldshop | Alles voor huis</title>\n<meta name="description" content="Korte tekst over de winkel.">\n<meta property="og:description" content="Korte tekst over de winkel.">\n</head><body><h1>Welkom</h1></body></html>`;
  const r = applyMetaDescriptionToSource("templates/index.html", src, NEW, "Korte tekst over de winkel.");
  assert.equal(r.ok, true);
  assert.equal(r.mode, "html_attribute");
  assert.equal(r.content, src.replace('<meta name="description" content="Korte tekst over de winkel.">', `<meta name="description" content="${NEW}">`));
  assert.match(r.content, /og:description" content="Korte tekst over de winkel\."/);
});

test("html: attribute order and quoting variants, special characters escaped", () => {
  const src = `<head><meta content='Oud & kort' name='description' data-x></head>`;
  const r = applyMetaDescriptionToSource("index.html", src, NEW + "", "Oud & kort");
  assert.equal(r.ok, true);
  const amp = applyMetaDescriptionToSource("index.html", src, NEW.replace("keukenspullen", "pannen & \"potten\""), "Oud &amp; kort");
  assert.equal(amp.ok, true);
  assert.match(amp.content, /pannen &amp; &quot;potten&quot;/);
  assert.match(amp.content, /data-x>/);
});

test("jinja child template: only the description block changes", () => {
  const src = `{% extends "base.html" %}\n{% block title %}Account | Voorbeeldshop{% endblock %}\n{% block description %}Je accountomgeving.{% endblock %}\n{% block content %}<h1>Account</h1>{% endblock %}`;
  const r = applyMetaDescriptionToSource("templates/account.html", src, NEW, "Je accountomgeving.");
  assert.equal(r.ok, true);
  assert.equal(r.mode, "template_block");
  assert.equal(r.content, src.replace("Je accountomgeving.", NEW));
});

test("dynamic and parent-default descriptions are never edited", () => {
  const dyn = `<head><meta name="description" content="{{ product.seo_description }}"></head>`;
  assert.deepEqual(applyMetaDescriptionToSource("product.html", dyn, NEW, ""), { ok: false, code: "DYNAMIC_DESCRIPTION" });
  const base = `<head><title>{% block title %}Shop{% endblock %}</title><meta name="description" content="{% block description %}Standaardtekst.{% endblock %}"></head>`;
  assert.equal(applyMetaDescriptionToSource("base.html", base, NEW, "Standaardtekst.").ok, false);
});

test("file whose description differs from the live scan is not edited", () => {
  const src = `<head><meta name="description" content="Een andere pagina."></head>`;
  assert.deepEqual(applyMetaDescriptionToSource("about.html", src, NEW, "Korte tekst over de winkel."), { ok: false, code: "SCAN_MISMATCH" });
});

test("two description tags: ambiguous, nothing changes", () => {
  const src = `<head><meta name="description" content="A"><meta name="description" content="B"></head>`;
  assert.deepEqual(applyMetaDescriptionToSource("index.html", src, NEW, ""), { ok: false, code: "AMBIGUOUS_DESCRIPTION" });
});

test("missing description: one tag is inserted in this file's head", () => {
  const src = `<html><head><title>X</title></head><body></body></html>`;
  const r = applyMetaDescriptionToSource("index.html", src, NEW, "");
  assert.equal(r.ok, true);
  assert.equal(r.mode, "html_insert");
  assert.equal((r.content.match(/name="description"/g) || []).length, 1);
});

test("next.js metadata: top-level description only, openGraph untouched", () => {
  const src = `export const metadata = {\n  title: "Voorbeeldshop",\n  openGraph: { description: "Kort OG." },\n  description: "Kort.",\n};\n`;
  const r = applyMetaDescriptionToSource("app/layout.tsx", src, NEW, "Kort.");
  assert.equal(r.ok, true);
  assert.match(r.content, /openGraph: \{ description: "Kort OG\." \}/);
  assert.ok(r.content.includes(`description: ${JSON.stringify(NEW)}`));
});

test("evidence fallback uses only verified text and stays within the guideline", () => {
  const input = {
    current: "Ontdek keukenspullen, tuingereedschap en opbergoplossingen bij Voorbeeldshop.",
    h1: "Alles voor een opgeruimd en praktisch huis",
    title: "Voorbeeldshop | Handige spullen voor binnen en buiten",
  };
  const out = buildEvidenceDescription(input);
  assert.ok(out, "fallback expected");
  assert.ok(out.length >= 120 && out.length <= 160, String(out.length));
  const sourceWords = new Set(Object.values(input).join(" ").toLowerCase().match(/[\p{L}\p{N}]+/gu));
  for (const word of out.toLowerCase().match(/[\p{L}\p{N}]+/gu)) assert.ok(sourceWords.has(word), `invented word: ${word}`);
});

test("evidence fallback refuses when verified text is too thin", () => {
  assert.equal(buildEvidenceDescription({ current: "Webshop.", title: "Shop", h1: "" }), null);
});

test("ai json is extracted from fenced or chatty output", () => {
  assert.deepEqual(parseAiJsonObject('```json\n{"description":"a {b} c"}\n```'), { description: "a {b} c" });
  assert.deepEqual(parseAiJsonObject('Hier is het: {"description":"x \\" y"} klaar'), { description: 'x " y' });
  assert.equal(parseAiJsonObject(""), null);
});

test("normalize strips tags, entities and wrapping quotes", () => {
  assert.equal(normalizeDescriptionText(' "Pannen &amp; <b>potten</b>" '), "Pannen & potten");
});

function mockFetch(responses, seen) {
  return async (_url, init) => {
    seen.push(JSON.parse(init.body));
    const next = responses.shift();
    return new Response(typeof next.body === "string" ? next.body : JSON.stringify(next.body), { status: next.status || 200, headers: { "content-type": "application/json" } });
  };
}

async function withKey(fn, model) {
  const prev = { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL };
  process.env.OPENAI_API_KEY = "sk-test-key-not-real";
  if (model) process.env.OPENAI_MODEL = model; else delete process.env.OPENAI_MODEL;
  const origError = console.error; console.error = () => {};
  try { return await fn(); } finally {
    console.error = origError;
    if (prev.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prev.key;
    if (prev.model === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = prev.model;
  }
}

const base = { url: "https://voorbeeld.test/", current: "Korte tekst over de winkel.", title: "Voorbeeldshop", h1: "Welkom" };

test("reasoning model: incomplete answer (budget spent on reasoning) is retried, not a 500", async () => {
  const seen = [];
  const r = await withKey(() => generateMetaDescription({ ...base, fetchImpl: mockFetch([
    { body: { status: "incomplete", output: [{ type: "reasoning", content: [] }] } },
    { body: { status: "completed", output_text: JSON.stringify({ description: NEW }) } },
  ], seen) }));
  assert.deepEqual(r, { ok: true, text: NEW, source: "ai", attempts: 2 });
  assert.equal(seen[0].reasoning.effort, "low");
  assert.ok(seen[0].max_output_tokens >= 2000);
});

test("too-short AI text is rejected and retried with feedback", async () => {
  const seen = [];
  const r = await withKey(() => generateMetaDescription({ ...base, fetchImpl: mockFetch([
    { body: { output_text: '{"description":"Te kort."}' } },
    { body: { output_text: JSON.stringify({ description: NEW }) } },
  ], seen) }));
  assert.equal(r.ok, true);
  assert.match(seen[1].input, /rejected: TOO_SHORT/);
});

test("model that rejects the reasoning parameter is retried without it", async () => {
  const seen = [];
  const r = await withKey(() => generateMetaDescription({ ...base, fetchImpl: mockFetch([
    { status: 400, body: { error: { message: "Unsupported parameter: 'reasoning'" } } },
    { body: { output_text: JSON.stringify({ description: NEW }) } },
  ], seen) }), "gpt-5-mini");
  assert.equal(r.ok, true);
  assert.ok(seen[0].reasoning && !seen[1].reasoning);
});

test("provider outage with thin evidence returns a clear code instead of throwing", async () => {
  const seen = [];
  const r = await withKey(() => generateMetaDescription({ ...base, fetchImpl: mockFetch([
    { status: 503, body: { error: { message: "overloaded" } } },
    { status: 503, body: { error: { message: "overloaded" } } },
  ], seen) }));
  assert.deepEqual(r, { ok: false, code: "AI_PROVIDER_ERROR", attempts: 2 });
});

test("no API key: evidence fallback when possible, never an exception", async () => {
  const prev = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  try {
    const r = await generateMetaDescription({ url: "https://voorbeeld.test/", current: "Ontdek keukenspullen, tuingereedschap en opbergoplossingen bij Voorbeeldshop.", title: "Voorbeeldshop | Handige spullen voor binnen en buiten", h1: "Alles voor een opgeruimd en praktisch huis" });
    assert.equal(r.ok, true);
    assert.equal(r.source, "evidence");
    const thin = await generateMetaDescription(base);
    assert.deepEqual(thin, { ok: false, code: "AI_UNAVAILABLE", attempts: 0 });
  } finally { if (prev !== undefined) process.env.OPENAI_API_KEY = prev; }
});

test("routes: description proposals and GitHub edits use the shared deterministic path", () => {
  const aiFix = readFileSync(new URL("../app/api/ai-fix/route.ts", import.meta.url), "utf8");
  assert.match(aiFix, /if \(type === "meta_description"\) \{\s*const generated = await generateMetaDescription/);
  const gh = readFileSync(new URL("../app/api/github/fix/route.ts", import.meta.url), "utf8");
  const descIdx = gh.indexOf('if(issueId==="META_DESCRIPTION_GUIDANCE"||issueId==="META_DESCRIPTION_MISSING"){\n        // Deterministic');
  const aiIdx = gh.indexOf("await generateCodeFix(path,current,issue,context,issueId)");
  assert.ok(descIdx > 0 && aiIdx > descIdx, "description patch must run before (and instead of) the full-file AI rewrite");
  assert.match(gh, /applyMetaDescriptionToSource\(path,current,descriptionText,liveDescription\)/);
  assert.match(gh, /if\(suppliedText!==null&&!checkDescriptionCandidate\(approvedText,liveDescription\)\.ok\)/);
  assert.match(gh, /code:"APPROVED_TEXT_INVALID"/);
  const page = readFileSync(new URL("../app/dashboard/github/page.tsx", import.meta.url), "utf8");
  // The approved text is sent with the preview, and only that stored proposal can be published.
  assert.match(page, /preview: true, language/);
  assert.doesNotMatch(page, /await fetch\("\/api\/ai-fix"/);
  assert.match(page, /proposal_id: p\.proposalId, proposal_hash: p\.proposalHash, publish_mode: mode/);
  assert.match(page, /nl: "Fix probleem"/);
});

test("regression: TrendMix's intentionally short description is fixable even without external AI", async () => {
  const short="Ontdek gadgets en slimme producten bij TrendMix.";
  const html='<html><head><title>TrendMix | Slimme gadgets en meer</title><meta name="description" content="'+short+'"></head>'+
    '<body><main><section class="hero"><h1>Slimme gadgets voor een makkelijker leven.</h1>'+
    '<p>Handige tech, praktische accessoires en slimme producten voor thuis, onderweg en op kantoor.</p></section></main></body></html>';
  const extra=extractSourceDescriptionEvidence("templates/index.html",html);
  assert.deepEqual(extra,["Handige tech, praktische accessoires en slimme producten voor thuis, onderweg en op kantoor."]);
  const before=process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try{
    const proposal=await generateMetaDescription({
      url:"https://trendmix-q6fx.vercel.app/",current:short,
      title:"TrendMix | Slimme gadgets en meer",
      h1:"Slimme gadgets voor een makkelijker leven.",extra
    });
    assert.equal(proposal.ok,true,JSON.stringify(proposal));
    assert.equal(proposal.source,"evidence");
    assert.ok(proposal.text.length>=120&&proposal.text.length<=160);
    const changed=applyMetaDescriptionToSource("templates/index.html",html,proposal.text,short);
    assert.equal(changed.ok,true);
    assert.equal(changed.content,html.replace('content="'+short+'"','content="'+proposal.text+'"'));
    const textEvidence=new Set([short,"TrendMix | Slimme gadgets en meer","Slimme gadgets voor een makkelijker leven.",...extra].join(" ").toLowerCase().match(/[\p{L}\p{N}]+/gu));
    for(const word of proposal.text.toLowerCase().match(/[\p{L}\p{N}]+/gu)) assert.ok(textEvidence.has(word),"unexpected unverified word: "+word);
  }finally{
    if(before===undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY=before;
  }
});

test("source paragraphs with dynamic placeholders never become trusted marketing claims",()=>{
  assert.deepEqual(extractSourceDescriptionEvidence("templates/index.html",
    '<main><p>{{ product.price }} euro direct geleverd in heel Europa.</p><p>Handige tech, praktische accessoires en slimme producten voor thuis, onderweg en op kantoor.</p></main>'),
    ["Handige tech, praktische accessoires en slimme producten voor thuis, onderweg en op kantoor."]);
  assert.deepEqual(extractSourceDescriptionEvidence("app/layout.tsx","<p>Not source HTML</p>"),[]);
});

test("TrendMix source fallback chooses complete real sentences, not an unfinished clause",()=>{
  const description="Ontdek gadgets en slimme producten bij TrendMix.";
  const hero="Handige tech, praktische accessoires en slimme producten voor thuis, onderweg en op kantoor.";
  const result=buildEvidenceDescription({current:description,title:"TrendMix | Slimme gadgets en meer",h1:"Slimme gadgets voor een makkelijker leven.",extra:[hero]});
  assert.equal(result,description+" "+hero);
  assert.ok(result.length>=120&&result.length<=160);
  assert.doesNotMatch(result,/\b(?:en|of|de|het|voor|met|bij)\.$/i);
});

test("transient form and status feedback is never trusted as SEO description copy", () => {
  const bad="Ontdek gadgets en slimme producten bij Voorbeeldshop. Slimme gadgets voor een makkelijker leven. Je bericht kon niet worden verzonden.";
  assert.ok(bad.length>=120&&bad.length<=160);
  assert.deepEqual(checkDescriptionCandidate(bad).errors.includes("TRANSIENT_UI_MESSAGE"),true);
  const source='<main><p>Je bericht kon niet worden verzonden. Probeer het later opnieuw. Met deze melding kan een klant niet verder.</p><p>Ontdek gadgets en slimme producten bij Voorbeeldshop, van slimme accessoires tot praktische artikelen.</p></main>';
  const evidence=extractSourceDescriptionEvidence("templates/index.html",source);
  assert.equal(evidence.length,1);
  assert.doesNotMatch(evidence[0],/Je bericht kon niet worden verzonden/);
  const text=buildEvidenceDescription({current:"Ontdek gadgets en slimme producten bij Voorbeeldshop.",h1:"Slimme gadgets voor een makkelijker leven.",extra:["Je bericht kon niet worden verzonden.",evidence[0]]});
  assert.ok(text===null||!text.includes("Je bericht kon niet worden verzonden."));
});

test("QA: old 153-character message must be corrected, not counted as a good description", () => {
  const polluted="Ontdek gadgets en slimme producten bij TrendMix. Slimme gadgets voor een makkelijker leven. Slimme gadgets en meer. Je bericht kon niet worden verzonden.";
  assert.equal(polluted.length,153);
  assert.equal(isTransientSeoCopy(polluted),true);
  assert.ok(checkDescriptionCandidate(polluted).errors.includes("TRANSIENT_UI_MESSAGE"));
  const repaired=buildEvidenceDescription({current:polluted,title:"TrendMix | Slimme gadgets en meer",h1:"Slimme gadgets voor een makkelijker leven.",extra:["Handige tech, praktische accessoires en slimme producten voor thuis, onderweg en op kantoor."]});
  assert.ok(repaired===null || (checkDescriptionCandidate(repaired,polluted).ok && !isTransientSeoCopy(repaired)),repaired??"");
  assert.equal(isTransientSeoCopy("Slimme gadgets en accessoires voor thuis."),false);
});

test("QA: scan, source, and live-verification enforce the same content quality", () => {
  const scan=readFileSync(new URL("../app/api/scan/route.ts",import.meta.url),"utf8");
  const fix=readFileSync(new URL("../app/api/github/fix/route.ts",import.meta.url),"utf8");
  const engine=readFileSync(new URL("../lib/fix-engine.ts",import.meta.url),"utf8");
  assert.match(scan,/isTransientSeoCopy\(description\)/);
  assert.match(fix,/checkDescriptionCandidate\(description\)\.ok/);
  assert.match(engine,/if\(!checkDescriptionCandidate\(live\)\.ok\) return "not_yet"/);
});

test("QA: a form-notice description can be repaired with only verified source sentences",()=>{
 const bad="Ontdek gadgets en slimme producten bij TrendMix. Slimme gadgets voor een makkelijker leven. Slimme gadgets en meer. Je bericht kon niet worden verzonden.";
 const hero="Handige tech, praktische accessoires en slimme producten voor thuis, onderweg en op kantoor.";
 const good=buildEvidenceDescription({current:bad,title:"TrendMix | Slimme gadgets en meer",h1:"Slimme gadgets voor een makkelijker leven.",extra:[hero]});
 assert.ok(good!==null,"should find a bounded combination from verified static page copy");
 assert.equal(checkDescriptionCandidate(good,bad).ok,true);
 assert.doesNotMatch(good,/je bericht|verzonden|verzenden/i);
 assert.match(good,/Ontdek gadgets en slimme producten bij TrendMix/);
 assert.ok(good.length>=120&&good.length<=160);
});
