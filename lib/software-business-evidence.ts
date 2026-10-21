/**
 * First-party identity signals for businesses selling software as the service.
 * Domain independent. These describe the company's own product, not its
 * customers' industries or generic payment/checkout vocabulary.
 */
export const SOFTWARE_PRODUCT_IDENTITY =
  /\b(?:(?:sales[\s-]?funnel|verkoop[\s-]?funnel|marketing[\s-]?automatisering|marketing automation|checkout|betaalpagina(?:'s)?|payment[\s-]?page|landing[\s-]?page|website|webpage|webpagina|sales[\s-]?automation|business automation|workflow)\s*(?:software|platform|systeem|system|builder|bouwer|tool|app(?:licatie)?)|(?:website|webpagina|landingpagina|funnel|checkout)\s*(?:bouwer|builder)|(?:salesfunnel|verkoopfunnel|checkout|betaalpagina|website|marketingautomatisering)(?:software|platform|systeem|builder|bouwer)|saas|software[\s-]?as[\s-]?a[\s-]?service|software platform|business software|api platform|auditsoftware|seo software|geo software|website audit|seo audit|geo audit)\b/iu;

/**
 * Independent signals of a software product, used as supporting evidence only.
 * "Payments", "checkout" or "business" alone do NOT prove the company's sector.
 */
export const SOFTWARE_PRODUCT_CAPABILITIES =
  /\b(?:demo|features|functies|integrations|integraties|koppelingen|dashboard|website scan|website scannen|website analyseren|audit platform|gratis proberen|probeer gratis|free trial|start free|proefperiode|proefaccount|website (?:online|bouwen|maken)|websites (?:bouwen|maken)|betaalpagina(?:'s|s)?|payment pages?|funnels?|upsells?|landingspagina(?:'s|s)?|landing pages?|abonnementen?|klantportaal|inloggen|login|no[\s-]?code|automatiseringen|automations)\b/iu;
