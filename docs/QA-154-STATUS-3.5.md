# QA #154 — status of the historical findings on the frozen 3.5 engine (17 Oct 2026)

Checked on frozen commit `5776f92` with the offline matrix (real homepage identities read on 16 Oct, neutral `.test` hosts, no domain rules). None of these sites is in the independent 68-site set. These are reproductions of the published homepage identity, **not live re-scans**.

| Historical 3.1 finding (#151) | Frozen 3.5 result | Status |
|---|---|---|
| RTL Lëtzebuerg: news typed transport; 100 at 53% coverage | news_media 96%; 99, provisional, 85% coverage; 100 impossible with unconfirmed checks | Opgelost (offline) |
| Unieuro: retail typed events | ecommerce 96% | Opgelost (offline) |
| BCR: bank typed webshop | financial_services 96%, bank voucher shop does not make it retail | Opgelost (offline) |
| ÖBB: secondary booking/shop beat primary identity | transport_travel 74% (probable): homepage title/description do not name the service; only navigation does | Sector juist, zekerheid bewust begrensd |
| airBaltic: booking widget beat airline identity | transport_travel 95% | Opgelost (offline) |
| bpost: stamp eShop beat postal identity | transport_travel 90% (post) | Opgelost (offline) |
| VRT: sector not confirmed | unknown (abstains); corporate homepage "Homepage \| VRT" names no service | Niet bewezen — abstentie is eerlijk, verbetering alleen met sterker bewijs |
| RTP, STVR, SVT | news_media 96% | Opgelost (offline) |
| 1177 | health_wellness 90% | Opgelost (offline) |
| Comenius University | education 93% (uniba fixture) | Opgelost (offline) |
| portal.gov.cz | government 94% | Opgelost (offline) |
| Partial JS render as proven error / final high score | renderPartial → provisional; JS-dependent absences unconfirmed (tests in central-rendering, score-qualifier, engine-35) | Opgelost |

Open after the freeze (fix branch `fix/engine-3.5.1-post-pilot`, not used by the pilot):
- A small sample is now explained in the report (`multiPage.sampleLimitation`: no internal links, refused raw HTML, sitemap refused with HTTP status, failed fetches).

Not verifiable from Claude's environment: whether the 68-site pilot runs, on which deployment and database (no Neon or Vercel deployment access). The frozen preview `rankfix-6057tbhog-scoop5.vercel.app` = `5776f92` per GitHub deployment status.

Exploratory field scan 17-10 21:27 (B2B manufacturer from the exploratory register, not in the independent set): sector and sample (28 pages) correct; three generic gaps reproduced synthetically and fixed on this branch:
- business details shown only on the sampled contact page are now site-level evidence (evidence URL = that page);
- support and portal pages below a "products" section are typed as service (multilingual service intent);
- a CMS field label printed into a title ("… | Careers Description") is flagged when the label follows the brand or a URL section; real titles such as "job description" stay untouched.

Weak points fixed on this branch (17-10 evening):
- Organisation-name nouns extended (hospital, energy utility, newspaper, ferry operator) with ambiguity guards ("Energy Gym", "Avis" not matched); evidence line names the sector.
- Secondary activities also from two or more sampled offer pages whose own title/description name another sector with high certainty (editorial/corporate/legal pages excluded); never activates a sector module.
- Germanic compound insurance nouns ("reisverzekering", "Krankenversicherung", "hemförsäkring").
- More bot-challenge pages recognised ("Pardon Our Interruption", "Request Rejected", "Robot or human?", PerimeterX denial).
- Test contact data in Swedish, Danish, Finnish, Romanian, Polish, Czech, Portuguese.
- English explanation of a small sample.
Not changed (honest limits): a sitemap refused to RankFix is not fetched through the browser (a browser shows XML as a viewer, not reliable evidence); axe-core availability depends on the runtime.
