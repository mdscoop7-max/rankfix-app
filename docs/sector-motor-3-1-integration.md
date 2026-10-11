# Sector Motor 3.1 — integratieplan

Status: wacht op `rankfix-sector-motor-3-1-v2.bundle`. Er wordt geen vervangende
Sector Motor gebouwd zolang de originele commits herstelbaar zijn.

## Uitgangspunten

| Onderdeel | Waarde |
|---|---|
| Basiscommit (Sector Motor 3.0) | `f1293c1` op `feat/sector-motor-3-weighted-evidence-20261009` |
| Te herstellen commits | `3d27d95`, `53f0d0d` |
| Doelbranch | `feat/sector-motor-3-1-universal-evidence-arbiter-20261010` |
| Scannercorrecties om mee te nemen | branch `ccr-32af646c-k71s9w` (hreflang, HTML-entiteiten, contactbewijs, paginaselectie, lockfile) |

`f1293c1` en `ccr-32af646c-k71s9w` hebben dezelfde basis (`dfbe309`).

## Herstel uit de bundle

```bash
git bundle verify rankfix-sector-motor-3-1-v2.bundle
git bundle list-heads rankfix-sector-motor-3-1-v2.bundle
git fetch rankfix-sector-motor-3-1-v2.bundle '+refs/heads/*:refs/remotes/bundle/*'
git cat-file -t 3d27d95 && git cat-file -t 53f0d0d
git merge-base --is-ancestor f1293c1 53f0d0d   # 3.1 moet op 3.0 voortbouwen
git push origin 53f0d0d:refs/heads/feat/sector-motor-3-1-universal-evidence-arbiter-20261010
git ls-remote origin feat/sector-motor-3-1-universal-evidence-arbiter-20261010   # SHA controleren
```

Pas daarna de scannercorrecties toe met een merge (geen rebase of force-push), zodat
de originele SHA's behouden blijven.

## Samenvoegen met de scannercorrecties (proef op 3.0 uitgevoerd)

Een proefmerge van `f1293c1` in de correctiebranch geeft drie conflicthunks (twee in
`route.ts`, één in de tests). Laatste proef op `c8ebd61`: na oplossing 151/151 tests,
TypeScript 0 fouten, productiebuild geslaagd. Los elk conflict apart op: een
automatische vervanging van alle hunks door hetzelfde blok is fout.

| Bestand | Conflict | Oplossing |
|---|---|---|
| `app/api/scan/route.ts` | 3.0 voegde een FAQ-limiet (max. 3) toe aan de inline paginaselectie; de correcties verplaatsten die selectie naar `selectRepresentativePages` | Zie codeblok hieronder |
| `app/api/scan/route.ts` (cookies) | 3.0 voegde `getSetCookie` toe in de oude inline cookiecode (met de kapotte `\\s`-regexen); de correcties verplaatsten die naar `lib/security-signals.ts` | Versie van de correcties houden (`setCookieValues` + `observeCookie`); die gebruikt ook `getSetCookie` |
| `tests/scanner-regression.test.mjs` | Beide zetten de limiettest op 30 | Versie van de correcties houden |
| `lib/sector-catalog.ts` | Geen | Niet aangeraakt door de correcties |

```ts
// FAQ/help-center pages can dominate a crawl and crowd out product,
// category, service and legal evidence. Preserve a small FAQ sample.
const isFaqSample = (url: string) => /\/(?:faq|faqs|veelgestelde-vragen|help-center|helpcentrum|hilfe|ayuda|assistance)(?:\/|$)/i.test(new URL(url).pathname);
const uniqueMultiPagePages = selectRepresentativePages([scannedPageSample, ...multiPagePages], rankedMultiPage, representativePageLimit, normalizeScanUrl, templateShapeKey, { matches: isFaqSample, limit: 3 });
```

Als 3.1 dezelfde blokken verder wijzigt, eerst opnieuw een proefmerge doen.

Na de merge faalt de bewakingstest "no regex matches a literal backslash" op één regel
die 3.0 zelf toevoegt: `app/dashboard/page.tsx` (`siteHost`, `/^www\\./` moet `/^www\./`
zijn, twee keer). Herstel die in de merge.
Controleer bij 3.1 de uitvoer van die test opnieuw: elke regel die hij noemt is een
regex die nooit matcht.

## Controle na herstel

1. `npm ci`, `npm test`, `npx tsc --noEmit`, `npx next build`, `npx eslint .`
2. `tests/sector-motor-3.test.mjs` en eventuele 3.1-tests moeten slagen.
3. Sectormatrix — per sector controleren: sector, activiteiten, formulieren,
   producten en welke auditmodules actief zijn.

| Sector | Testsite (voorbeeld) | Moet herkennen | Mag niet |
|---|---|---|---|
| Webshop / retailketen | IKEA NL (`/nl/nl/`), DiscountOffice, beauty-webshop | producten, winkelwagen, checkout, commercecontroles actief | commercecontroles uitschakelen door toerisme- of transportwoorden |
| Internationale landkeuze | ikea.com (globaal) | landkeuzeportaal, `x-default` zonder waarschuwing | als webshop met ontbrekende checkout beoordeeld worden |
| Dienstverlener | tandartspraktijk | afspraak, behandelingen, contact | productcontroles activeren |
| Makelaar | makelaarswebsite | woningaanbod, bezichtiging | als webshop gezien worden |
| Transport | transportbedrijf | diensten, offerte | als reisbureau/toerisme gezien worden |
| Hotel | hotel | kamers, beschikbaarheid, boeking | als webshop gezien worden |
| Restaurant | restaurant | menu, reservering | als webshop gezien worden |

Echte scans alleen in een geïsoleerde testomgeving: geen productiedatabase,
geen echte betalingen, geen productie-e-mails.

## Wat al zonder bundle is opgelost (branch `ccr-32af646c-k71s9w`)

- Webshopcontroles: drie uitkomsten via `lib/commerce-applicability.ts` (bevestigd,
  aantoonbaar afwezig = N.v.t., niet te bevestigen). Landkeuzepagina's, JavaScript-shells
  en zwakke webshopsignalen geven geen N.v.t. meer.
- Landkeuzepagina's worden generiek herkend via hreflang (`isMarketSelectorPage`), zonder merkregels.
- Het rapport toont webshopfunctionaliteit als aparte regel naast de sector.

## Nog afhankelijk van Sector Motor 3.1

- De sectorkeuze zelf (bijvoorbeeld IKEA/Zalando landversie als retail, zekerheid boven 35%).
- Weging van tegenstrijdig sectorbewijs over meerdere pagina's (Universal Evidence Arbiter).
- Na integratie: `commerceApplicability` moet de 3.1-beslissing als `confirmed` /
  `primaryNonCommerceIdentity` blijven gebruiken; de proefmerge hierboven opnieuw uitvoeren.
