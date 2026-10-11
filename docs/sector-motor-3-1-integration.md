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

## Verwachte overlap bij het samenvoegen

| Bestand | Waarom | Aanpak |
|---|---|---|
| `tests/scanner-regression.test.mjs` | 3.0 wijzigde de paginalimiettest naar 30; de correcties vervangen de inline-controle door `selectRepresentativePages` | Versie van de correcties houden |
| `app/api/scan/route.ts` | Beide wijzigen de scanner, in verschillende blokken | Per blok samenvoegen, daarna volledige testset |
| `lib/sector-catalog.ts` | Alleen gewijzigd door Sector Motor | Niet aangeraakt door de correcties |

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
