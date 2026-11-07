/**
 * Comparison and quote platforms (QA #207 Schoenen.nl, #209 Slimster.nl).
 *
 * A price comparison site or quote marketplace lists products, prices or
 * specialists, but ordering, payment and delivery happen at connected shops or
 * providers. It is neither a webshop (no own checkout) nor a publisher (the blog
 * supports the platform). Only the site's OWN identity decides (title,
 * description, H1, own About page); a shop that says "compare our models" or a
 * blog that reviews products is not a platform. No site or domain rules.
 */
const PLATFORM_SELF = /(?<![\p{L}])(?:prijsvergelijk\p{L}*|vergelijkingssite\p{L}*|vergelijkingsplatform\p{L}*|vergelijkplatform\p{L}*|vergelijkingswebsite\p{L}*|offerteplatform\p{L}*|offertesite\p{L}*|offerte-?marktplaats\p{L}*|\p{L}+zoekmachine(?![\p{L}])|zoekmachine\s+voor\s+\p{L}+|price\s+comparison(?:\s+(?:site|website|platform|engine))?|comparison\s+(?:site|website|platform|engine)|compare\s+(?:quotes|prices|offers|deals)|quote\s+(?:platform|marketplace)|preisvergleich\p{L}*|vergleichsportal\p{L}*|vergleichsplattform\p{L}*|comparateur(?:\s+de\s+prix)?|comparatore(?:\s+(?:di\s+)?prezzi)?|comparador(?:\s+de\s+precios)?|offertes\s+(?:vergelijken|aanvragen)|vergelijk\s+(?:offertes|prijzen|aanbieders|aanbiedingen|energieleveranciers|zorgverzekeringen|abonnementen)|gratis\s+offertes)(?![\p{L}])/iu;
// What the platform says about who sells: connected shops / specialists do.
const REFERRAL = /(?<![\p{L}])(?:aangesloten\s+(?:winkels?|webshops?|verkopers?|specialisten|aanbieders|partners?|vakbedrijven)|bij\s+de\s+(?:winkel|webshop|verkoper|aanbieder)|partner(?:winkels?|shops?)|connected\s+(?:shops|stores|retailers|providers)|partner\s+(?:shops|stores|retailers)|we\s+(?:do\s+not|don't)\s+sell|geen\s+eigen\s+voorraad|verkopen\s+zelf\s+geen|wir\s+verkaufen\s+nicht|nous\s+ne\s+vendons\s+pas)(?![\p{L}])/iu;

export type PlatformIdentity = { kind: "comparison_platform"; evidence: string[] } | null;

/** The site's own words say it compares offers / mediates quotes. */
export function comparisonPlatformIdentity(input: { ownText: string; aboutTexts?: string[] }): PlatformIdentity {
  const own = String(input.ownText || "");
  const about = (input.aboutTexts || []).join(" · ");
  const ownHit = PLATFORM_SELF.test(own);
  const aboutHit = PLATFORM_SELF.test(about);
  const referral = REFERRAL.test(own + " · " + about);
  if (!ownHit && !(aboutHit && referral)) return null;
  return {
    kind: "comparison_platform",
    evidence: [
      ownHit ? "Eigen titel/omschrijving: vergelijkings- of offerteplatform" : "Eigen over-ons-pagina: vergelijkings- of offerteplatform",
      ...(referral ? ["Verkoop of uitvoering loopt via aangesloten winkels of aanbieders"] : []),
    ],
  };
}

/** A title/site name that compares offers is a platform, not a publication. */
export function isComparisonPlatformText(text: string): boolean {
  return PLATFORM_SELF.test(String(text || ""));
}
