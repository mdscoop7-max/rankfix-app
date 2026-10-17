// RankFix 3.5 engine regression set (17 Oct 2026). Each scenario reproduces one
// GENERIC failure class found in field reports (score certainty, crawler blocks,
// unproven absences, page typing, sector mix, applicability, sampling, evidence
// source, security/accessibility claims, test contact data). Hosts are neutral
// .test domains; no scenario names or mimics a real brand, and no engine rule may
// depend on a host. Runs the REAL /api/scan route with a controllable network
// and browser (see loader.mjs).
// Run: node --experimental-strip-types --import ./tests/scan-matrix/register.mjs tests/scan-matrix/run-engine-35.mjs
const ld = (o) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...o })}</script>`;
const FOOTER = {
  nl: "Voorbeeld Groep B.V. · KvK 34098712 · Herengracht 182, 1016 BR Amsterdam · klantenservice@__HOST__ · +31 20 547 8812",
  fr: "Groupe Exemple SA · SIRET 552 081 317 00026 · 9 rue du Colisée, 75008 Paris · service@__HOST__ · +33 1 44 87 52 10",
  it: "Gruppo Esempio S.p.A. · P.IVA IT09218470152 · Viale Europa 175, 00144 Roma · assistenza@__HOST__ · +39 06 4527 1180",
  de: "Beispiel Bank AG · Friedrichstraße 76, 10117 Berlin · kontakt@__HOST__ · +49 30 2087 4410",
  pl: "Przykład Bank S.A. · ul. Prosta 18, 00-850 Warszawa · kontakt@__HOST__ · +48 22 637 4410",
  en: "Example Group plc · 14 Fleet Street, London EC4Y 1AA · hello@__HOST__ · +44 20 7946 0321",
};
function page({ lang = "nl", title, desc, h1, body = "", lds = [], links = [], canonical = "__URL__", head = "", footer, og = true, scripts = 0 }) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title>${desc ? `<meta name="description" content="${desc}">` : ""}<meta name="viewport" content="width=device-width, initial-scale=1">${canonical ? `<link rel="canonical" href="${canonical}">` : ""}${og ? `<meta property="og:title" content="${title}"><meta property="og:description" content="${desc || title}"><meta property="og:image" content="https://__HOST__/og.jpg"><meta name="twitter:card" content="summary">` : ""}${lds.map(ld).join("")}${head}</head><body><header><nav><a href="/">Home</a> ${links.map(([h, t]) => `<a href="${h}">${t}</a>`).join(" ")} <a href="/contact">Contact</a> <a href="/privacy">Privacy</a></nav></header><main>${h1 ? `<h1>${h1}</h1>` : ""}${body}<img src="/hero.jpg" alt="${h1 || title}"></main><footer><p>${footer ?? FOOTER[lang] ?? FOOTER.en}</p><a href="/cookies">Cookies</a></footer>${Array.from({ length: scripts }, (_, i) => `<script src="/s${i}.js"></script>`).join("")}</body></html>`;
}
const filler = (lang, n) => {
  const w = { nl: "informatie over onze dienstverlening en de voorwaarden", fr: "informations sur nos services et les conditions applicables", it: "informazioni sui nostri servizi e sulle condizioni applicate", de: "Informationen zu unseren Leistungen und den geltenden Bedingungen", pl: "informacje o naszych usługach i obowiązujących warunkach", en: "information about our services and the applicable conditions" }[lang] || "information";
  return `<p>${Array.from({ length: n }, () => w).join(". ")}.</p>`;
};
const org = (name, type = "Organization", extra = {}) => ({ "@type": type, name, url: "https://__HOST__/", ...extra });
const product = (name, price, lang) => ({ "@type": "Product", name, image: "https://__HOST__/p.jpg", sku: `SKU-${price}`, offers: { "@type": "Offer", price: String(price), priceCurrency: "EUR", availability: "https://schema.org/InStock" } });

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
const S = [];

// 1 + 2. Crawler block: RankFix's first request gets 403, a browser receives the
// real page and later requests of the same URL return 200. The website works; the
// block is aimed at the scanner and must not be reported as a website error.
{
  const host = "luchtvaart.test"; let homeHits = 0;
  const home = page({ lang: "fr", title: "Compagnie aérienne – vols vers l'Europe et l'Afrique | AirExemple", desc: "Réservez vos vols, gérez votre réservation et enregistrez-vous en ligne. Bagages, horaires et destinations.", h1: "Vols vers 120 destinations",
    body: filler("fr", 40) + "<p>Réserver un vol. Enregistrement en ligne. Statut du vol.</p>", lds: [org("AirExemple", "Airline"), { "@type": "WebSite", name: "AirExemple", url: "https://__HOST__/" }],
    links: [["/fr/reserver", "Réserver un vol"], ["/fr/bagages", "Bagages"], ["/fr/enregistrement", "Enregistrement en ligne"]] });
  S.push({ id: "crawler-403-intermittent", host, lang: "fr",
    route: (u) => { if (u.pathname === "/") { homeHits++; return homeHits === 1 ? { status: 403, body: "<html><head><title>Access Denied</title></head><body>Access Denied</body></html>" } : { body: home }; } },
    render: (u) => u.pathname === "/" ? home : null,
    expect: (j, P) => {
      const st = j.checks.find((c) => c.key === "status");
      if (["warning", "fail"].includes(st?.status)) P(`status check blames the website: ${st.status} – ${st.message.slice(0, 120)}`);
      const resp = j.checks.find((c) => c.key === "response");
      if (resp && ["warning", "fail"].includes(resp.status) && /403/.test(resp.message)) P("response time measured on a blocked response");
      if (!j.access?.rankfixBlocked) P("report does not say the scanner was blocked (access.rankfixBlocked)");
      const home = (j.multiPage?.pageAudits || []).find((a) => new URL(a.url).pathname === "/");
      if (home && home.httpStatus === 200 && st && /HTTP 403/.test(st.message) && st.status !== "unable_to_confirm") P("sample says HTTP 200 while the HTTP-status check reports 403");
      for (const c of j.checks) if ((c.status === "warning" || c.status === "fail") && /HTTP 403/.test(c.message)) P(`${c.key} turns a 403 to RankFix into a website issue`);
    } });
}
{
  const host = "spoor.test";
  const home = page({ lang: "en", title: "Rail tickets and timetables | RailExample", desc: "Buy train tickets, check timetables and travel information for journeys across the country.", h1: "Plan your train journey",
    body: filler("en", 40), lds: [org("RailExample"), { "@type": "WebSite", name: "RailExample", url: "https://__HOST__/" }], links: [["/en/tickets", "Tickets"], ["/en/timetables", "Timetables"]] });
  S.push({ id: "crawler-403-always", host, lang: "en",
    route: (u) => { if (u.pathname === "/") return { status: 403, body: "<html><head><title>Forbidden</title></head><body>Forbidden</body></html>", headers: { server: "AkamaiGHost" } }; },
    render: (u) => u.pathname === "/" ? home : null,
    expect: (j, P) => {
      const st = j.checks.find((c) => c.key === "status");
      if (st?.status !== "unable_to_confirm") P(`status check should be unable_to_confirm when only the scanner is blocked, got ${st?.status}`);
      if (st?.points) P("blocked status carries points");
      if (!j.access?.rankfixBlocked || j.access?.originalStatus !== 403) P(`access block not recorded: ${JSON.stringify(j.access)}`);
    } });
}

// 2b. Field report 17-10 (13:28) pattern: RankFix gets 403 on the page and the
// declared sitemap; the browser-rendered page has a brand-only title whose NAME
// states the trade ("… Airlines"), no description, no JSON-LD, generic H1s.
// Sector must follow the organisation name (+ hostname), the 403s are not faults.
{
  const host = "nordairlines.test";
  const home = `<!doctype html><html><head><meta charset="utf-8"><title>Nord Airlines</title><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"></head><body><header><img src="/logo.svg"></header><main><h1>Welcome</h1><h1>Special offers</h1><h1>Need help?</h1><h1>Get our app</h1><p>${"Discover our offers and manage everything in one place. ".repeat(20)}</p><img src="/a.jpg"></main></body></html>`;
  S.push({ id: "brand-only-title-blocked-sitemap", host, lang: "en",
    route: (u) => {
      if (u.pathname === "/") return { status: 403, body: "<html><head><title>Access Denied</title></head><body>Access Denied</body></html>" };
      if (u.pathname === "/robots.txt") return { body: "User-agent: *\nAllow: /\nSitemap: https://__HOST__/sitemaps/sitemap-index.xml\n" };
      if (u.pathname === "/sitemaps/sitemap-index.xml") return { status: 403, body: "<html>denied</html>" };
    },
    render: (u) => u.pathname === "/" ? home : null,
    expect: (j, P) => {
      if (j.sectorProfile.sector !== "transport_travel") P(`sector ${j.sectorProfile.sector}/${j.sectorProfile.confidenceScore} (organisation name says airline)`);
      const sm = j.checks.find((c) => c.key === "sitemap");
      if (["warning", "fail"].includes(sm?.status)) P(`sitemap ${sm.status} although RankFix was refused (403): ${sm.message.slice(0, 100)}`);
      const st = j.checks.find((c) => c.key === "status");
      if (["warning", "fail"].includes(st?.status)) P(`status ${st.status}: ${st.message.slice(0, 80)}`);
      for (const c of j.checks) if (/^(?:merchant_|checkout_|webshop_|product_)/.test(c.key) && c.status === "unable_to_confirm" && j.sectorProfile.sector === "transport_travel" && !j.multiPage?.representativeProduct) P(`${c.key} unconfirmed on a carrier without product evidence`);
      // Field report 14:03: sample row said "HTTP: 403 … http: HTTP 200" and "in raw HTML" on a rendered page.
      const home = (j.multiPage?.pageAudits || []).find((a) => new URL(a.url).pathname === "/");
      const httpLine = home?.evidenceChecks?.find((e) => e.key === "http");
      if (httpLine && /HTTP 200/.test(httpLine.details)) P(`sample evidence says "${httpLine.details}" next to HTTP ${home.httpStatus}`);
      if ((home?.evidenceChecks || []).some((e) => /raw HTML/.test(e.details)) && j.rendering?.javascriptExecuted) P("sample says 'raw HTML' although the page was rendered");
      // A homepage without any internal link has no navigation/footer loaded: missing privacy/contact links are unproven.
      // 3.5.1: a small sample says why (sitemap refused, no links, refused raw HTML).
      const lim = j.multiPage?.sampleLimitation;
      if (!lim || !/sitemap weigerde RankFix \(HTTP 403\)/.test(lim.note) || !/geen interne links/.test(lim.note)) P(`small sample not explained: ${JSON.stringify(lim)}`);
      const trust = j.checks.find((c) => c.key === "trust_legal_signals");
      if (["warning", "fail"].includes(trust?.status)) P(`trust_legal_signals ${trust.status} on a page without any internal link`);
    } });
}
// 2c. Negative controls for the organisation-name rule.
{
  const mk = (id, host, title, expectNot, expectIn) => S.push({ id, host, lang: "nl", route: (u) => u.pathname === "/" && { body: page({ lang: "nl", title, desc: "", h1: "Welkom", body: filler("nl", 30) }) },
    expect: (j, P) => { const s = j.sectorProfile.sector; if (expectNot && s === expectNot) P(`sector ${s} from a domain label or audience`); if (expectIn && !expectIn.includes(s)) P(`sector ${s} (expected ${expectIn})`); } });
  mk("name-rule-hostname-only", "voedselbank.test", "Welkom", "financial_services");
  mk("name-rule-audience", "airsoft.test", "Software voor airlines en hotels", "transport_travel");
  mk("name-rule-bank-name", "noordbank.test", "Noord Bank", null, ["financial_services"]);
}

// 8b. Sample sources when the scanned document has (almost) no same-site links.
{
  const sub = (lang, t) => page({ lang, title: `${t} | VervoerVoorbeeld`, desc: `${t}: informatie, tarieven en voorwaarden.`, h1: t, body: filler(lang, 25) });
  const sitemap = (host, paths) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${p.startsWith("http") ? p : `https://${host}${p}`}</loc></url>`).join("")}</urlset>`;
  const bare = (title, h1) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="Reizen met de trein en bus door het hele land."></head><body><main><h1>${h1}</h1><p>${"Plan je reis met trein en bus. ".repeat(25)}</p></main></body></html>`;
  // (a) Blocked + rendered without links; valid sitemap lists pages (and one foreign URL).
  S.push({ id: "sample-from-sitemap-when-no-links", host: "reisvoorbeeld.test", lang: "nl",
    route: (u) => {
      if (u.pathname === "/") return { status: 403, body: "denied" };
      if (u.pathname === "/sitemap.xml") return { body: sitemap("reisvoorbeeld.test", ["/", "/tickets", "/dienstregeling", "/reisinformatie", "/contact-en-service", "/over-ons", "https://ander.test/externe-pagina"]) };
      if (["/tickets", "/dienstregeling", "/reisinformatie", "/contact-en-service", "/over-ons"].includes(u.pathname)) return { body: sub("nl", u.pathname.slice(1).replace(/-/g, " ")) };
    },
    render: (u) => u.pathname === "/" ? bare("Spoorvoorbeeld – treinreizen en dienstregeling", "Plan je treinreis") : null,
    expect: (j, P) => {
      const audited = (j.multiPage?.pageAudits || []).filter((a) => a.status === "audited" && new URL(a.url).pathname !== "/");
      if (audited.length < 3) P(`only ${audited.length} extra page(s) sampled although the sitemap lists 5 (${JSON.stringify(j.multiPage?.fallbackSources)})`);
      if (j.multiPage?.sampleLinkSource !== "fallback" || !(j.multiPage?.fallbackSources || []).some((x) => /sitemap/.test(x))) P(`fallback source not reported: ${j.multiPage?.sampleLinkSource} ${JSON.stringify(j.multiPage?.fallbackSources)}`);
      if ((j.multiPage?.pageAudits || []).some((a) => /ander\.test/.test(a.url))) P("a foreign sitemap URL entered the sample");
    } });
  // (b) Links point to the bare domain while the page lives on www.: same site.
  const wwwHome = page({ lang: "nl", title: "Busvervoer en dienstregeling | BusVoorbeeld", desc: "Busreizen, tickets en dienstregeling.", h1: "Reizen met de bus", body: filler("nl", 30) + ["/tickets", "/dienstregeling", "/abonnementen", "/reisinformatie"].map((p) => `<a href="https://busvoorbeeld.test${p}">${p.slice(1)}</a>`).join(" ") });
  S.push({ id: "sample-links-to-bare-domain", host: "www.busvoorbeeld.test", lang: "nl",
    route: (u) => u.pathname === "/" ? { body: wwwHome } : ["/tickets", "/dienstregeling", "/abonnementen", "/reisinformatie"].includes(u.pathname) ? { body: sub("nl", u.pathname.slice(1)) } : null,
    expect: (j, P) => { const n = (j.multiPage?.pageAudits || []).filter((a) => a.status === "audited" && /tickets|dienstregeling|abonnementen|reisinformatie/.test(a.url)).length; if (n < 3) P(`links to the bare domain ignored (${n} sampled)`); } });
  // (c) Rendered DOM lost its navigation; the server HTML has it.
  const rawWithNav = page({ lang: "nl", title: "Veerdienst en overtochten | VeerVoorbeeld", desc: "Overtochten, tarieven en vertrektijden.", h1: "Overtochten", body: filler("nl", 30), links: [["/overtochten", "Overtochten"], ["/tarieven", "Tarieven"], ["/vertrektijden", "Vertrektijden"]], scripts: 6, head: '<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>' });
  S.push({ id: "sample-from-raw-html-links", host: "veervoorbeeld.test", lang: "nl",
    route: (u) => u.pathname === "/" ? { body: rawWithNav } : ["/overtochten", "/tarieven", "/vertrektijden"].includes(u.pathname) ? { body: sub("nl", u.pathname.slice(1)) } : null,
    render: (u) => u.pathname === "/" ? bare("Veerdienst en overtochten | VeerVoorbeeld", "Overtochten") + `<p>${"Veerdienst naar de eilanden met dagelijkse afvaarten. ".repeat(40)}</p>` : null,
    expect: (j, P) => { const n = (j.multiPage?.pageAudits || []).filter((a) => a.status === "audited" && /overtochten|tarieven|vertrektijden/.test(a.url)).length; if (n < 2) P(`server-HTML navigation not used (${n} sampled, render=${j.rendering?.javascriptExecuted})`); } });
  // (d) Control: enough page links → sitemap-only pages are not pulled in.
  const linked = page({ lang: "nl", title: "Taxi en vervoer op maat | TaxiVoorbeeld", desc: "Taxi bestellen, tarieven en zakelijk vervoer.", h1: "Taxi bestellen", body: filler("nl", 30), links: [["/tarieven", "Tarieven"], ["/zakelijk", "Zakelijk"], ["/luchthavenvervoer", "Luchthavenvervoer"]] });
  S.push({ id: "sample-control-page-links-win", host: "taxivoorbeeld.test", lang: "nl",
    route: (u) => u.pathname === "/" ? { body: linked } : u.pathname === "/sitemap.xml" ? { body: sitemap("taxivoorbeeld.test", ["/alleen-in-sitemap"]) } : ["/tarieven", "/zakelijk", "/luchthavenvervoer", "/alleen-in-sitemap"].includes(u.pathname) ? { body: sub("nl", u.pathname.slice(1)) } : null,
    expect: (j, P) => { if (j.multiPage?.sampleLimitation) P("sample limitation reported although the sample is complete"); if (j.multiPage?.sampleLinkSource !== "page_links") P(`source ${j.multiPage?.sampleLinkSource}`); if ((j.multiPage?.pageAudits || []).some((a) => /alleen-in-sitemap/.test(a.url))) P("sitemap used although the page had enough links"); } });
}

// 3. Reduced bot response without bot cookies (header-only bot manager): head
// metadata stripped. Missing description / social / structured data is not proven.
{
  const host = "beschermdebank.test";
  const thin = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Beispiel Bank</title></head><body><div><p>${"Willkommen bei der Beispiel Bank. ".repeat(12)}</p><a href="/de/konten">Konten</a> <a href="/de/kredite">Kredite</a> <a href="/de/kontakt">Kontakt</a></div></body></html>`;
  const sub = (title, h1) => page({ lang: "de", title: `${title} | Beispiel Bank`, desc: `${title} bei der Beispiel Bank: Konditionen, Gebühren und Antrag online.`, h1, body: filler("de", 30), lds: [org("Beispiel Bank", "BankOrCreditUnion")] });
  S.push({ id: "reduced-bot-header-only", host, lang: "de",
    route: (u) => {
      const hdr = { "x-datadome": "protected", "x-datadome-cid": "abc" };
      if (u.pathname === "/") return { body: thin, headers: hdr };
      if (u.pathname === "/de/konten") return { body: sub("Girokonto eröffnen", "Girokonto"), headers: hdr };
      if (u.pathname === "/de/kredite") return { body: sub("Ratenkredit beantragen", "Ratenkredit"), headers: hdr };
    },
    expect: (j, P) => {
      for (const k of ["description", "social", "schema", "organization_website", "h1", "twitter_card"]) {
        const c = j.checks.find((x) => x.key === k);
        if (c && ["warning", "fail"].includes(c.status)) P(`${k}=${c.status} on a bot-reduced response (absence not proven)`);
      }
    } });
}

// 4. Page typing from content: service pages below non-commerce paths, a hub that
// URL-wise looks like a catalogue, real news with a date, and audience segments.
{
  const host = "postdienst.test"; const lang = "fr";
  const pages = {
    "/": page({ lang, title: "Courrier, colis et services postaux | PosteExemple", desc: "Envoyer un colis ou une lettre, suivre un envoi, services pour particuliers et entreprises.", h1: "Courrier, colis et services",
      body: filler(lang, 30), lds: [org("PosteExemple", "Organization"), { "@type": "WebSite", name: "PosteExemple", url: "https://__HOST__/" }],
      links: [["/particulier/envoyer-un-colis", "Envoyer un colis"], ["/particulier/suivre-un-envoi", "Suivre un envoi"], ["/entreprises/solutions-expedition", "Solutions d'expédition pour entreprises"], ["/particulier/catalogue", "Toutes nos offres"], ["/actualites/2026/10/nouveaux-horaires", "Nouveaux horaires"]] }),
    "/particulier/envoyer-un-colis": page({ lang, title: "Envoyer un colis en France et à l'international : tarifs et délais | PosteExemple", desc: "Comment envoyer un colis : tarifs, délais de livraison, dépôt en bureau de poste ou en ligne.", h1: "Envoyer un colis", body: filler(lang, 25) + "<p>Tarifs à partir de 5,25 €. Déposez votre colis en bureau de poste.</p>" }),
    "/particulier/suivre-un-envoi": page({ lang, title: "Suivre un envoi | PosteExemple", desc: "Suivez votre colis ou votre lettre recommandée avec le numéro de suivi.", h1: "Suivre un envoi", body: filler(lang, 20) + "<form action='/suivi'><input name='numero'><button>Suivre</button></form>" }),
    "/entreprises/solutions-expedition": page({ lang, title: "Solutions d'expédition pour entreprises | PosteExemple", desc: "Expédiez vos colis professionnels : enlèvement, tarifs négociés, intégration e-commerce.", h1: "Solutions d'expédition", body: filler(lang, 25), lds: [{ "@type": "Service", name: "Expédition entreprises", provider: { "@type": "Organization", name: "PosteExemple" } }] }),
    "/particulier/catalogue": page({ lang, title: "Toutes nos offres d'envoi | PosteExemple", desc: "Découvrez toutes nos offres pour envoyer du courrier et des colis.", h1: "Nos offres", body: filler(lang, 20) + "<ul><li><a href='/particulier/envoyer-un-colis'>Colis</a></li><li><a href='/particulier/lettre-recommandee'>Lettre recommandée</a></li><li><a href='/particulier/timbres'>Timbres</a></li></ul>" }),
    "/actualites/2026/10/nouveaux-horaires": page({ lang, title: "Nouveaux horaires des bureaux de poste | PosteExemple", desc: "À partir du 1er novembre, les horaires des bureaux changent.", h1: "Nouveaux horaires des bureaux de poste", body: "<article><time datetime='2026-10-12'>12 octobre 2026</time>" + filler(lang, 15) + "</article>", lds: [{ "@type": "NewsArticle", headline: "Nouveaux horaires", datePublished: "2026-10-12" }] }),
  };
  S.push({ id: "page-types-service-content", host, lang, route: (u) => pages[u.pathname] && { body: pages[u.pathname] },
    expect: (j, P) => {
      const typeOf = (p) => (j.multiPage?.pageAudits || []).find((a) => new URL(a.url).pathname === p)?.type;
      for (const p of ["/particulier/envoyer-un-colis", "/entreprises/solutions-expedition"]) { const t = typeOf(p); if (t && t !== "service") P(`${p} typed ${t} (expected service from its own content)`); if (!t) P(`${p} not sampled`); }
      const cat = typeOf("/particulier/catalogue"); if (cat === "category") P("an offer hub without products or prices typed as product category");
      const news = typeOf("/actualites/2026/10/nouveaux-horaires"); if (news && news !== "article") P(`dated news typed ${news}`);
    } });
}
{
  const host = "bankpl.test"; const lang = "pl";
  const pages = {
    "/": page({ lang, title: "Bank dla Ciebie i Twojej firmy – konta, kredyty, karty | BankPL", desc: "Załóż konto osobiste, weź kredyt gotówkowy lub otwórz konto firmowe online.", h1: "Bankowość osobista i firmowa", body: filler(lang, 30), lds: [org("BankPL", "BankOrCreditUnion")],
      links: [["/indywidualny/konta/konto-osobiste", "Konto osobiste"], ["/firmy/konto-firmowe", "Konto firmowe"], ["/firmy/leasing", "Leasing dla firm"], ["/aktualnosci/nowe-zasady-przelewow", "Nowe zasady przelewów"]] }),
    "/indywidualny/konta/konto-osobiste": page({ lang, title: "Konto osobiste – załóż online | BankPL", desc: "Załóż konto osobiste online w 10 minut. Karta, BLIK i aplikacja.", h1: "Konto osobiste", body: filler(lang, 25), lds: [{ "@type": ["Product", "BankAccount"], name: "Konto osobiste", offers: { "@type": "Offer", price: "0", priceCurrency: "PLN" } }] }),
    "/firmy/konto-firmowe": page({ lang, title: "Konto firmowe dla przedsiębiorców | BankPL", desc: "Otwórz konto firmowe online. Przelewy, karty firmowe i bankowość internetowa dla firm.", h1: "Konto firmowe", body: filler(lang, 25) }),
    "/firmy/leasing": page({ lang, title: "Leasing dla firm – złóż wniosek | BankPL", desc: "Leasing samochodów i maszyn dla firm. Złóż wniosek online.", h1: "Leasing", body: filler(lang, 25) }),
    "/aktualnosci/nowe-zasady-przelewow": page({ lang, title: "Nowe zasady przelewów od listopada | BankPL", desc: "Od 1 listopada zmieniają się godziny realizacji przelewów.", h1: "Nowe zasady przelewów", body: "<article><time datetime='2026-10-09'>9 października 2026</time>" + filler(lang, 15) + "</article>", lds: [{ "@type": "NewsArticle", headline: "Nowe zasady", datePublished: "2026-10-09" }] }),
  };
  S.push({ id: "page-types-bank-segments", host, lang, route: (u) => pages[u.pathname] && { body: pages[u.pathname] },
    expect: (j, P) => {
      const typeOf = (p) => (j.multiPage?.pageAudits || []).find((a) => new URL(a.url).pathname === p)?.type;
      for (const p of ["/indywidualny/konta/konto-osobiste", "/firmy/konto-firmowe", "/firmy/leasing"]) { const t = typeOf(p); if (t && t !== "service") P(`${p} typed ${t} (expected service)`); }
      const n = typeOf("/aktualnosci/nowe-zasady-przelewow"); if (n && n !== "article") P(`news typed ${n}`);
      if (j.sectorProfile.sector !== "financial_services") P(`sector ${j.sectorProfile.sector}`);
      if (j.multiPage?.representativeProduct) P("a bank account became the representative retail product");
    } });
}

// 5 + 6. Mixed business model: a postal operator that also sells collector items
// online (real product pages with Product schema and a cart) and offers accounts.
{
  const host = "postamista.test"; const lang = "it";
  const pages = {
    "/": page({ lang, title: "Spedizioni, pacchi e servizi postali | PostaEsempio", desc: "Spedisci pacchi e lettere, traccia le spedizioni. Conti e pagamenti negli uffici postali.", h1: "Spedizioni e servizi postali",
      body: filler(lang, 30), lds: [org("PostaEsempio"), { "@type": "WebSite", name: "PostaEsempio", url: "https://__HOST__/" }],
      links: [["/spedire/pacco", "Spedire un pacco"], ["/conti/conto-base", "Conto di base"], ["/prodotti/francobollo-collezione-2026", "Francobollo da collezione 2026"], ["/prodotti/kit-imballaggio-medio", "Kit imballaggio medio"], ["/notizie/2026/10/nuovi-orari", "Nuovi orari"]] }),
    "/spedire/pacco": page({ lang, title: "Spedire un pacco in Italia e all'estero | PostaEsempio", desc: "Come spedire un pacco: tariffe, tempi di consegna e ritiro a domicilio.", h1: "Spedire un pacco", body: filler(lang, 25) }),
    "/conti/conto-base": page({ lang, title: "Conto di base – apri il conto | PostaEsempio", desc: "Apri un conto corrente di base con carta e app.", h1: "Conto di base", body: filler(lang, 20), lds: [{ "@type": ["Product", "BankAccount"], name: "Conto di base" }] }),
    "/prodotti/francobollo-collezione-2026": page({ lang, title: "Francobollo da collezione 2026 | PostaEsempio Shop", desc: "Acquista il francobollo da collezione 2026. Disponibile, spedizione in 3 giorni.", h1: "Francobollo da collezione 2026", body: "<p>€ 12,50</p><form action='/carrello/aggiungi' method='post'><button>Aggiungi al carrello</button></form><p>Disponibile</p>", lds: [product("Francobollo da collezione 2026", 12.5, lang)] }),
    "/prodotti/kit-imballaggio-medio": page({ lang, title: "Kit imballaggio medio | PostaEsempio Shop", desc: "Acquista il kit imballaggio medio con 5 scatole.", h1: "Kit imballaggio medio", body: "<p>€ 8,90</p><form action='/carrello/aggiungi' method='post'><button>Aggiungi al carrello</button></form><p>Disponibile</p>", lds: [product("Kit imballaggio medio", 8.9, lang)] }),
    "/notizie/2026/10/nuovi-orari": page({ lang, title: "Nuovi orari degli uffici | PostaEsempio", desc: "Cambiano gli orari degli uffici postali.", h1: "Nuovi orari degli uffici", body: "<article><time datetime='2026-10-10'>10 ottobre 2026</time>" + filler(lang, 12) + "</article>", lds: [{ "@type": "NewsArticle", headline: "Nuovi orari", datePublished: "2026-10-10" }] }),
  };
  S.push({ id: "mixed-post-retail-finance", host, lang, route: (u) => pages[u.pathname] && { body: pages[u.pathname] },
    expect: (j, P) => {
      const audits = j.multiPage?.pageAudits || [];
      const productPages = audits.filter((a) => a.status === "audited" && a.type === "product");
      if (productPages.length < 1) P(`confirmed product pages not typed as product (${audits.map((a) => new URL(a.url).pathname + "=" + a.type).join(", ")})`);
      for (const c of j.checks) if (c.status === "not_applicable" && /geen producten|geen product(?:pagina)?'s|no products/i.test(c.message)) P(`${c.key}: N.v.t. claims no products although product pages were confirmed`);
      const ps = j.checks.find((c) => c.key === "product_schema");
      if (ps && ps.status === "not_applicable") P("product_schema N.v.t. although sampled product pages carry Product schema");
      const sec = (j.sectorProfile.secondaryActivities || []).map((x) => x.sector);
      if (!sec.includes("ecommerce")) P(`secondary retail activity missing (${sec.join(",") || "none"})`);
      if (!sec.includes("financial_services")) P(`secondary financial activity missing (${sec.join(",") || "none"})`);
      if (j.sectorProfile.sector === "ecommerce") P("collector shop became the primary sector");
      if (j.multiPage?.representativeProduct && /conto/.test(j.multiPage.representativeProduct.url)) P("a bank account is the representative product");
    } });
}

// 6a. Same class, intangible primary sector: a bank that also runs a collector
// shop under a localized path. Confirmed product pages may never be reported as
// "no products found", whatever language the product path is in.
{
  const host = "bancamonete.test"; const lang = "it";
  const pages = {
    "/": page({ lang, title: "Banca online – conti correnti, mutui e carte | BancaEsempio", desc: "Apri un conto corrente online, richiedi un mutuo o una carta di credito.", h1: "La tua banca online", body: filler(lang, 30), lds: [org("BancaEsempio", "BankOrCreditUnion")],
      links: [["/conti/conto-online", "Conto online"], ["/negozio/moneta-argento-2026", "Moneta d'argento 2026"]] }),
    "/conti/conto-online": page({ lang, title: "Conto online a canone zero | BancaEsempio", desc: "Apri il conto online con carta di debito inclusa.", h1: "Conto online", body: filler(lang, 20), lds: [{ "@type": ["Product", "BankAccount"], name: "Conto online" }] }),
    "/negozio/moneta-argento-2026": page({ lang, title: "Moneta d'argento 2026 | BancaEsempio Negozio", desc: "Acquista la moneta d'argento commemorativa 2026.", h1: "Moneta d'argento 2026", body: "<p>€ 49,00</p><form action='/carrello/aggiungi' method='post'><button>Aggiungi al carrello</button></form><p>Disponibile</p>", lds: [product("Moneta d'argento 2026", 49, lang)] }),
  };
  S.push({ id: "finance-shop-localized-path", host, lang, route: (u) => pages[u.pathname] && { body: pages[u.pathname] },
    expect: (j, P) => {
      if (j.sectorProfile.sector !== "financial_services") P(`sector ${j.sectorProfile.sector}`);
      const t = (j.multiPage?.pageAudits || []).find((a) => /moneta/.test(a.url))?.type;
      if (t !== "product") P(`collector product typed ${t}`);
      for (const c of j.checks) if (c.status === "not_applicable" && /geen producten|no products|beschrijven diensten/i.test(c.message)) P(`${c.key}: "${c.message.slice(0, 90)}" although a real product page was confirmed`);
      if (!(j.sectorProfile.secondaryActivities || []).some((x) => x.sector === "ecommerce")) P("secondary retail activity missing");
    } });
}

// 5b. Primary sector from typed schema and native compound words (no URL rules).
{
  const mk = (id, host, lang, title, desc, h1, lds, expect) => S.push({ id, host, lang, route: (u) => u.pathname === "/" && { body: page({ lang, title, desc, h1, body: filler(lang, 30), lds }) },
    expect: (j, P) => { if (!expect.includes(j.sectorProfile.sector)) P(`sector ${j.sectorProfile.sector}/${j.sectorProfile.confidenceScore} (expected ${expect})`); } });
  mk("sector-fr-postal", "courrier.test", "fr", "Courrier, colis et services postaux | PosteFR", "Envoyer un colis ou une lettre recommandée, acheter des timbres, suivre un envoi.", "Services postaux et colis", [org("PosteFR")], ["transport_travel"]);
  mk("sector-nl-compound-painter", "schilders.test", "nl", "Schildersbedrijf Jansen – binnen- en buitenschilderwerk", "Schilderwerk, houtrotherstel en onderhoud in de regio. Vraag een offerte aan.", "Schildersbedrijf in de regio", [org("Schildersbedrijf Jansen")], ["home_services"]);
  mk("sector-schema-accounting", "fiscaal.test", "nl", "Belastingadvies en administratie voor ondernemers | Fiscaal", "Administratie, belastingaangifte en financieel advies voor zzp en mkb.", "Belastingadvies voor ondernemers", [org("Fiscaal", "AccountingService")], ["professional_services"]);
  // Negative control: an art shop selling paintings ("schilderijen") is not a painter.
  mk("sector-nl-paintings-not-painter", "kunst.test", "nl", "Schilderijen kopen – online kunstgalerie | KunstShop", "Koop originele schilderijen en prints online. Gratis verzending.", "Schilderijen online kopen", [org("KunstShop", "OnlineStore")], ["ecommerce", "unknown", "events_culture"]);
}

// 6c. Product detail pages whose structured data also lists related products
// (a common template). They stay product pages; product checks must use them.
{
  const host = "postarelated.test"; const lang = "it";
  const withRelated = (name, price) => ({ ...product(name, price, lang), isRelatedTo: [product("Busta imbottita", 2.5, lang), product("Nastro adesivo", 3.2, lang)] });
  const pp = (name, price) => page({ lang, title: `${name} | PostaShop`, desc: `Acquista ${name} online.`, h1: name, body: `<p>€ ${String(price).replace(".", ",")}</p><form action='/carrello/aggiungi' method='post'><button>Aggiungi al carrello</button></form><p>Disponibile</p><h2>Prodotti correlati</h2>`, lds: [withRelated(name, price)] });
  const pages = {
    "/": page({ lang, title: "Spedizioni, pacchi e servizi postali | PostaDue", desc: "Spedisci pacchi e lettere raccomandate, compra francobolli, traccia le spedizioni.", h1: "Spedizioni e servizi postali", body: filler(lang, 30), lds: [org("PostaDue")],
      links: [["/spedire/pacco", "Spedire un pacco"], ["/shop/scatola-spedizione-l", "Scatola spedizione L"], ["/shop/francobolli-serie-2026", "Francobolli serie 2026"]] }),
    "/spedire/pacco": page({ lang, title: "Spedire un pacco | PostaDue", desc: "Tariffe e tempi per spedire un pacco.", h1: "Spedire un pacco", body: filler(lang, 25) }),
    "/shop/scatola-spedizione-l": pp("Scatola spedizione L", 4.9),
    "/shop/francobolli-serie-2026": pp("Francobolli serie 2026", 15),
  };
  S.push({ id: "product-pages-with-related-products", host, lang, route: (u) => pages[u.pathname] && { body: pages[u.pathname] },
    expect: (j, P) => {
      const types = (j.multiPage?.pageAudits || []).filter((a) => /\/shop\//.test(a.url)).map((a) => a.type);
      if (!types.length || types.some((t) => t !== "product")) P(`product detail pages typed ${types.join(",") || "none"}`);
      for (const c of j.checks) if (c.status === "not_applicable" && /^product_/.test(c.key)) P(`${c.key} N.v.t. (${c.message.slice(0, 90)}) although product pages with Product schema were sampled`);
    } });
}

// 6b. Financial products vs retail: Product+FinancialProduct pages are N.v.t. for
// retail checks with a reason that names financial products, not "no products".
{
  const host = "verzekeraar2.test"; const lang = "nl";
  const pages = {
    "/": page({ lang, title: "Verzekeringen en hypotheken | VerzekerVoorbeeld", desc: "Sluit online je autoverzekering, woonverzekering of hypotheek af.", h1: "Verzekeringen", body: filler(lang, 30), lds: [org("VerzekerVoorbeeld", "InsuranceAgency")],
      links: [["/producten/autoverzekering", "Autoverzekering"], ["/producten/woonverzekering", "Woonverzekering"]] }),
    "/producten/autoverzekering": page({ lang, title: "Autoverzekering afsluiten | VerzekerVoorbeeld", desc: "Bereken je premie en sluit direct af. Vanaf € 21,40 per maand.", h1: "Autoverzekering", body: filler(lang, 20) + "<p>Vanaf € 21,40 per maand</p>", lds: [{ "@type": ["Product", "FinancialProduct"], name: "Autoverzekering", offers: { "@type": "Offer", price: "21.40", priceCurrency: "EUR" } }] }),
    "/producten/woonverzekering": page({ lang, title: "Woonverzekering afsluiten | VerzekerVoorbeeld", desc: "Inboedel- en opstalverzekering online afsluiten.", h1: "Woonverzekering", body: filler(lang, 20), lds: [{ "@type": ["Product", "FinancialProduct"], name: "Woonverzekering" }] }),
  };
  S.push({ id: "financial-products-not-retail", host, lang, route: (u) => pages[u.pathname] && { body: pages[u.pathname] },
    expect: (j, P) => {
      if (j.sectorProfile.sector !== "financial_services") P(`sector ${j.sectorProfile.sector}`);
      for (const c of j.checks) if (/^(?:product_|merchant_|checkout_|webshop_)/.test(c.key) && ["warning", "fail"].includes(c.status)) P(`retail check ${c.key}=${c.status} on financial products`);
      for (const c of j.checks) if (c.status === "not_applicable" && /^product_/.test(c.key) && /geen producten/i.test(c.message)) P(`${c.key} says "geen producten" although financial products were found`);
    } });
}

// 8. Sampling: tracking-parameter variants and canonical duplicates.
{
  const host = "dienstverlener.test"; const lang = "nl";
  const svc = (title) => page({ lang, title: `${title} | AdviesVoorbeeld`, desc: `${title}: zo werkt het, kosten en aanvragen.`, h1: title, body: filler(lang, 25), canonical: "https://__HOST__/diensten/belastingaangifte" });
  const pages = {
    "/": page({ lang, title: "Belastingadvies en administratie voor ondernemers | AdviesVoorbeeld", desc: "Administratie, belastingaangifte en financieel advies voor zzp en mkb.", h1: "Belastingadvies voor ondernemers", body: filler(lang, 30), lds: [org("AdviesVoorbeeld", "AccountingService")],
      links: [["/diensten/belastingaangifte?utm_source=nieuwsbrief&utm_medium=email", "Belastingaangifte"], ["/diensten/belastingaangifte?xtor=CS1-24", "Aangifte doen"], ["/diensten/belastingaangifte?at_medium=affiliate&at_campaign=x", "Aangifte laten doen"], ["/diensten/belastingaangifte?srsltid=AfmBOo", "Aangifte"], ["/diensten/belastingaangifte-print", "Printversie aangifte"], ["/diensten/administratie", "Administratie"], ["/diensten/loonadministratie", "Loonadministratie"]] }),
    "/diensten/belastingaangifte": svc("Belastingaangifte"),
    "/diensten/belastingaangifte-print": svc("Belastingaangifte (print)"),
    "/diensten/administratie": page({ lang, title: "Administratie uitbesteden | AdviesVoorbeeld", desc: "Laat je boekhouding en btw-aangifte verzorgen.", h1: "Administratie", body: filler(lang, 25) }),
    "/diensten/loonadministratie": page({ lang, title: "Loonadministratie | AdviesVoorbeeld", desc: "Salarisadministratie en loonstroken voor je personeel.", h1: "Loonadministratie", body: filler(lang, 25) }),
  };
  S.push({ id: "sample-tracking-canonical", host, lang, route: (u) => pages[u.pathname] && { body: pages[u.pathname] },
    expect: (j, P) => {
      const audited = (j.multiPage?.pageAudits || []).filter((a) => a.status === "audited");
      const keys = audited.map((a) => { const u = new URL(a.url); return u.pathname; });
      const aangifte = audited.filter((a) => /belastingaangifte/.test(a.url));
      if (aangifte.length > 1) P(`same page sampled ${aangifte.length}× (${aangifte.map((a) => a.url).join(" , ")})`);
      for (const a of audited) if (/[?&](?:utm_|xtor|at_|srsltid|gclid)/i.test(a.url)) P(`tracking parameter kept in sample URL ${a.url}`);
      if (new Set(keys).size !== keys.length) P("duplicate sample paths");
    } });
}

// 10. Test / placeholder contact data is not business evidence.
{
  const host = "testgegevens.test"; const lang = "nl";
  const home = page({ lang, title: "Schilderwerk en onderhoud in Utrecht | SchilderVoorbeeld", desc: "Binnen- en buitenschilderwerk, houtrotherstel en onderhoud. Vraag een offerte aan.", h1: "Schildersbedrijf in Utrecht", body: filler(lang, 30) + "<p>Vraag een offerte aan.</p>",
    footer: "SchilderVoorbeeld · KvK 12345678 · Teststraat 1, 1234 AB Voorbeeldstad · info@example.com · +31 6 12345678", lds: [{ "@type": "WebSite", name: "SchilderVoorbeeld", url: "https://__HOST__/" }] });
  S.push({ id: "placeholder-contact-data", host, lang, route: (u) => u.pathname === "/" && { body: home },
    expect: (j, P) => {
      const bd = j.checks.find((c) => c.key === "business_placeholders");
      if (bd?.status === "pass") P(`test contact data accepted as business evidence: ${bd.message.slice(0, 140)}`);
      const ent = j.checks.find((c) => c.key === "entity");
      if (ent?.status === "pass" && /bedrijfsgegevens|KvK|adres|telefoon|e-mail/i.test(ent.message)) P("entity passes on test contact data");
    } });
}
// 10b. Control: genuine contact data still counts.
{
  const host = "echtegegevens.test"; const lang = "nl";
  const home = page({ lang, title: "Schilderwerk en onderhoud in Utrecht | SchilderEcht", desc: "Binnen- en buitenschilderwerk, houtrotherstel en onderhoud. Vraag een offerte aan.", h1: "Schildersbedrijf in Utrecht", body: filler(lang, 30),
    footer: "SchilderEcht · KvK 30187264 · Oudegracht 211, 3511 NH Utrecht · info@__HOST__ · 030 231 4477" });
  S.push({ id: "genuine-contact-data", host, lang, route: (u) => u.pathname === "/" && { body: home },
    expect: (j, P) => { const bd = j.checks.find((c) => c.key === "business_placeholders"); if (bd?.status !== "pass") P(`genuine business details not accepted: ${bd?.status} ${bd?.message?.slice(0, 120)}`); } });
}

// 9. Rendering: rich SSR HTML and a poorer browser snapshot. Raw HTML is kept and
// every scored check says where its evidence came from.
{
  const host = "ssrbetter.test"; const lang = "nl";
  const raw = page({ lang, title: "Energiecontract en tarieven | EnergieVoorbeeld", desc: "Vergelijk stroom- en gascontracten, bekijk tarieven en stap over.", h1: "Energie voor thuis", body: filler(lang, 60), lds: [org("EnergieVoorbeeld"), { "@type": "WebSite", name: "EnergieVoorbeeld", url: "https://__HOST__/" }], scripts: 6, head: '<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>', links: [["/stroom", "Stroom"], ["/gas", "Gas"]] });
  S.push({ id: "render-poorer-raw-kept", host, lang, route: (u) => u.pathname === "/" && { body: raw },
    render: (u) => u.pathname === "/" ? `<html><head><title>Energie</title></head><body><div id="__next"><p>Laden…</p></div></body></html>` : null,
    expect: (j, P) => {
      if (j.rendering?.evidenceSource !== "raw_html") P(`evidenceSource ${j.rendering?.evidenceSource}`);
      const allowed = new Set(["raw_html", "rendered_html", "http_response", "representative_sample", "robots_txt", "sitemap", "link_check", "structured_data"]);
      for (const c of j.checks) if (c.maxPoints > 0 && !allowed.has(c.evidence?.source)) P(`${c.key} has no evidence source (${c.evidence?.source})`);
    } });
}

// Report-wide invariants applied to every scenario that produced a report.
function invariants(j, P) {
  const level = j.scoreModel?.evidenceLevel;
  const utc = j.checks.filter((c) => c.status === "unable_to_confirm" && c.maxPoints > 0).length;
  if (level === "complete" && utc > 0) P(`evidenceLevel "complete" with ${utc} unconfirmed scored check(s)`);
  const r = j.scoreModel?.range;
  if (level === "complete" && r && r.low < r.high) P(`final score next to an internal range ${r.low}–${r.high}`);
  for (const c of [...j.checks, ...(j.security?.checks || []), ...(j.accessibility?.checks || [])]) {
    if (c.status === "pass" && /\b(?:volledig (?:veilig|toegankelijk)|wcag[- ]?(?:conform|compliant)|fully (?:secure|accessible)|website is veilig|site is secure|geen beveiligingsrisico)/i.test(c.message)) P(`${c.key}: absolute security/accessibility claim in a limited check`);
  }
  if (j.security && !j.security.limitedScope) P("security result does not declare its limited (passive) scope");
  if (j.accessibility && j.accessibility.mode !== "RENDERED_DOM" && typeof j.accessibility.score === "number" && j.accessibility.scoreShown !== false) P("accessibility score presented without a rendered DOM");
  for (const c of j.checks) if (c.status === "not_applicable" && /geen producten of productpagina/i.test(c.message) && (j.multiPage?.pageAudits || []).some((a) => a.status === "audited" && a.type === "product")) P(`${c.key}: "no product pages" next to sampled product pages`);
  if (j.selfCheck?.corrections?.length) P(`self-check corrections: ${j.selfCheck.corrections.map((c) => c.code).join(",")}`);
}

// ---------------------------------------------------------------------------
const robots = "User-agent: *\nAllow: /\nSitemap: https://__HOST__/sitemap.xml\n";
globalThis.fetch = async (input) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  const sc = S.find((s) => s.host === u.host) || S.find((s) => s.host.replace(/^www\./, "") === u.host.replace(/^www\./, ""));
  const fill = (b) => String(b).replaceAll("__URL__", u.origin + u.pathname).replaceAll("__HOST__", u.host);
  if (!sc) return new Response("nf", { status: 404, headers: { "content-type": "text/html" } });
  const own = (u.pathname === "/robots.txt" || /sitemap/.test(u.pathname)) ? sc.route(u) : null;
  if (own) return new Response(fill(own.body), { status: own.status || 200, headers: { "content-type": u.pathname.endsWith(".txt") ? "text/plain" : own.status ? "text/html" : "application/xml" } });
  if (u.pathname === "/robots.txt") return new Response(fill(robots), { status: 200, headers: { "content-type": "text/plain" } });
  if (u.pathname === "/sitemap.xml") return new Response(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${u.host}/</loc></url></urlset>`, { status: 200, headers: { "content-type": "application/xml" } });
  if (/\.(js|jpg|png|css|ico)$/.test(u.pathname)) return new Response("x", { status: 200, headers: { "content-type": /\.js$/.test(u.pathname) ? "application/javascript" : "image/jpeg", "content-length": "1" } });
  const r = sc.route(u);
  if (!r) return new Response("<html><head><title>Introuvable</title></head><body><h1>404</h1></body></html>", { status: 404, headers: { "content-type": "text/html" } });
  return new Response(fill(r.body), { status: r.status || 200, headers: { "content-type": "text/html; charset=utf-8", ...(r.headers || {}) } });
};
globalThis.__RF_RENDER = async (url) => {
  const u = new URL(url); const sc = S.find((s) => s.host === u.host) || S.find((s) => s.host.replace(/^www\./, "") === u.host.replace(/^www\./, ""));
  const html = sc?.render?.(u);
  if (!html) throw new Error("TimeoutError: Navigation timeout of 12000 ms exceeded");
  return { html: html.replaceAll("__URL__", u.origin + u.pathname).replaceAll("__HOST__", u.host), finalUrl: url, elapsedMs: 700, requests: 10, titlePixelWidth: 420, domAccessibility: { controls: 3, unnamedButtons: 0, unlabeledControls: 0 }, axeReport: null };
};
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const { POST } = await import(ROOT + "/app/api/scan/route.ts");
console.info = () => {}; console.warn = () => {};
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
let bad = 0, total = 0;
for (const sc of S) {
  if (only && !only.includes(sc.id)) continue;
  total++;
  const errs = []; const ce = console.error; console.error = (...a) => errs.push(a);
  let j, status;
  try { const res = await POST(new Request("http://localhost/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `https://${sc.host}/`, mode: "both", language: "nl" }) })); status = res.status; j = await res.json(); }
  catch (e) { j = { thrown: String(e?.stack || e) }; }
  console.error = ce;
  const p = []; const P = (m) => p.push(m);
  if (status !== 200) P(`HTTP ${status} ${j.error || j.thrown || ""} ${JSON.stringify(errs.find((e) => /scan failed/i.test(String(e[0])))?.[1] || "").slice(0, 600)}`);
  else {
    // DUMP=1 prints the commerce-related decisions for debugging a scenario.
    if (process.env.DUMP) console.log(JSON.stringify({ checks: j.checks.filter((c) => /product|merchant|checkout|webshop|eu_|price|status|response/.test(c.key)).map((c) => [c.key, c.status, c.message.slice(0, 110)]), commerce: j.commerceApplicability && { state: j.commerceApplicability.state, reason: j.commerceApplicability.reason }, modules: j.sectorProfile.applicableModules, pages: (j.multiPage?.pageAudits || []).map((a) => [new URL(a.url).pathname + new URL(a.url).search, a.type, a.status, a.httpStatus]) }, null, 1));
    try { sc.expect(j, P); invariants(j, P); } catch (e) { P(`assertion crashed: ${e?.stack || e}`); } }
  if (p.length) bad++;
  console.log(`${p.length ? "✗" : "✓"} ${sc.id.padEnd(30)} sector=${j.sectorProfile?.sector}/${j.sectorProfile?.confidenceScore} score=${j.overallScore} level=${j.scoreModel?.evidenceLevel} cov=${j.coverage?.coveragePercent}%`);
  for (const x of p) console.log("    - " + x);
}
console.log(`${total - bad}/${total} engine-3.5 scenario's correct`);
console.log("SCAN_MATRIX_RESULT " + JSON.stringify({ total, failed: bad }));
process.exit(0);
