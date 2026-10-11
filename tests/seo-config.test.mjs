import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveSiteUrl } from "../lib/site-url.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("one public origin, with the Vercel production domain as automatic fallback", () => {
  assert.equal(resolveSiteUrl({}), "https://rankfix-app.vercel.app");
  assert.equal(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "www.rankfix.ai" }), "https://www.rankfix.ai");
  assert.equal(resolveSiteUrl({ SITE_URL: "https://rankfix.example/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }), "https://rankfix.example");
  assert.equal(resolveSiteUrl({ SITE_URL: "not a url" }), "https://rankfix-app.vercel.app");
});

test("no SEO surface points at the retired Render domain", async () => {
  for (const file of ["app/layout.tsx", "app/robots.ts", "app/sitemap.ts", "lib/locale-metadata.ts"]) {
    const source = await read(file);
    assert.equal(source.includes("onrender.com"), false, file);
    assert.match(source, /SITE_URL/, file);
  }
});

test("only the root homepage inherits the homepage canonical and hreflang", async () => {
  const layout = await read("app/layout.tsx");
  assert.match(layout, /const isRootHome=pathnameHint==="\/";/);
  assert.match(layout, /\.\.\.\(isRootHome\?\{alternates:\{canonical:"\/"/);
  assert.equal(layout.includes('pathnameHint==="/" ? "/" : path'), false, "no fallback canonical to /nl for other pages");
});

test("private application pages are never indexed", async () => {
  for (const dir of ["dashboard", "account", "checkout"]) {
    const layout = await read(`app/${dir}/layout.tsx`);
    assert.match(layout, /robots: \{ index: false, follow: false \}/, dir);
    assert.match(layout, /canonical: null/, dir);
  }
});

test("public pages have their own title and canonical", async () => {
  assert.match(await read("app/pricing/page.tsx"), /title: pricingTitle,[\s\S]*canonical: "\/pricing"/);
  assert.match(await read("app/[locale]/help/page.tsx"), /export async function generateMetadata[\s\S]*localeMetadata\(locale,"help"/);
  assert.match(await read("app/[locale]/contact/page.tsx"), /export async function generateMetadata[\s\S]*localeMetadata\(locale,"contact"/);
  // Child pages replace openGraph wholesale, so they carry the full social set.
  assert.match(await read("lib/locale-metadata.ts"), /\.\.\.socialMetadata\("\/" \+ locale \+ suffix/);
});

test("sitemap lists every public page in every language; legacy URLs redirect permanently", async () => {
  const sitemap = await read("app/sitemap.ts");
  assert.match(sitemap, /\["", "\/scan", "\/help", "\/contact", "\/about", "\/privacy", "\/terms", "\/cookies"\]/);
  assert.match(sitemap, /alternates: \{ languages \}/);
  assert.match(sitemap, /\$\{SITE_URL\}\/pricing/);
  for (const file of ["app/privacy/page.tsx", "app/voorwaarden/page.tsx", "app/cookies/page.tsx"]) {
    assert.match(await read(file), /permanentRedirect\(/, file);
  }
  assert.match(await read("app/robots.ts"), /disallow: \["\/api\/"\]/);
});
