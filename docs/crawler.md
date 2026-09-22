# RankFix Pro Crawler

The crawler is intentionally deterministic and evidence-first.

## Modes
- QUICK: 5 HTML pages
- STANDARD: 25
- DEEP: 100
- ECOMMERCE: 150
- ENTERPRISE: 500

## Safety
- same-host crawling only
- HTTP(S) only
- private/link-local hosts blocked
- redirect chain limited
- tracking query parameters normalized away
- fragments removed
- HTML-only page model

## Page classification
Classification uses URL patterns, visible text and parsed JSON-LD types. It never uses an LLM.

The crawl result preserves URL, depth, discovery source, HTTP status, response time, metadata, indexability signal, internal links, image alt coverage, JSON-LD types and page type so the deterministic rule engine can evaluate the whole site in a later stage.
