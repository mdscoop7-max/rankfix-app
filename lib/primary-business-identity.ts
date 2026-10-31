/**
 * Primary-business evidence is deliberately separate from feature detection.
 * A website can offer bookings, guest payments, products or checkout services
 * without BEING a hotel or shop. Text from navigation, testimonials, FAQs or
 * clients is not allowed to establish a company's primary industry.
 *
 * Domain/brand independent; only title, description, headings and independently
 * declared structured types are considered.
 */

export type PrimaryBusinessIdentity = {
  sector: "financial_services" | "hospitality" | "unknown";
  /** Sub-type of a financial-services identity; absent for other sectors. */
  financialKind?: "payments" | "banking" | "insurance";
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  evidence: string[];
};

const paymentPurpose = /\b(?:payments? (?:platform|processing|processor|provider|gateway|services?|solutions?|infrastructure|technology)|(?:online|in[- ]person|digital|mobile|contactless) payments?|payment orchestration|accept (?:online |card |digital |in[- ]person )?payments?|process (?:online |card |digital )?payments?|payment service provider|merchant acquiring|merchant accounts?|fintech|financial services?|financial (?:infrastructure|platform|technology)|digital wallet|mobile wallet|(?:send|receive|transfer)(?:,? (?:and )?(?:send|receive|save|spend))* money|money transfers?|manage (?:your )?money|banking services?|betaalplatform|betaaldienst(?:verlener)?|betaaloplossingen|betalingen (?:accepteren|ontvangen|verwerken)|betaalverwerking|betaalprovider|geld (?:overmaken|versturen|sturen)|betalingsverkeer|zahlungs(?:anbieter|dienstleister|lösung(?:en)?|plattform|abwicklung|verkehr)|payment-?(?:lösung(?:en)?|anbieter|dienstleister|systeme?)|paymentlösung(?:en)?|bezahl(?:lösung(?:en)?|systeme?)|bezahl(?:lösung(?:en)?|terminals?|dienst(?:e|leister)?)|payment[- ](?:partner|lösung(?:en)?|anbieter|dienstleister|provider|oplossingen)|karten(?:zahlung(?:en)?|terminals?)|betaalterminals?|pinautomaten?|paiements? en ligne|solutions? de paiement|prestataires? de (?:services de )?paiement|terminaux? de paiement|pagos (?:online|en línea)|pasarela de pagos?|soluciones de pago|pagamenti (?:online|digitali)|soluzioni di pagamento)\b/i;
// Banks and insurers. Deliberately no bare "bank" (Dutch for sofa) or "savings".
const bankingPurpose = /\b(?:bankieren|online banking|mobiel bankieren|bankrekening|betaalrekening|spaarrekening|bank accounts?|savings accounts?|current accounts?|hypothe(?:ek|ken|cair)|mortgages?|persoonlijke lening|personal loans?|business loans?|zakelijke financiering|credit cards?|creditcards?|beleggen|vermogensbeheer|wealth management|girokonto|sparkonto|baufinanzierung|compte bancaire|conto corrente|cuenta bancaria)\b/i;
const insurancePurpose = /\b(?:verzekering(?:en)?|verzekeraar|zorgverzekering|autoverzekering|insurance|insurer|versicherung(?:en)?|assurances?|assicurazion[ei]|seguros?)\b/i;
// Online-sales language in the identity: such a site sells goods, so ambiguous
// words in its title ("camping", "saving", "insurance included") describe the
// assortment, not the company's own business.
const retailSalesLanguage = /\b(?:webshop|webwinkel|online winkel|online store|online shop|shop online|onlineshop|online (?:kopen|bestellen|shoppen)|bestel(?:len)? (?:direct |eenvoudig |snel )?online|koop (?:direct )?online|buy online|order online|gratis verzending|free shipping|kopen\b|bestellen\b|winkelwagen|in de winkel|shop now)\b/i;
// 31 Oct (Mollie recognised, PayPal/Adyen/Klarna/MultiSafepay not): the same
// offer in other words. A provider's own offer is ACCEPTING or PROCESSING payments
// for others, payment methods as its product, or pay-later as its product; a shop
// only mentions how its own customers can pay.
const providerOffer = /(?<![\p{L}])(?:online betalingen|betalingen voor (?:je |jouw |uw )?(?:bedrijf|onderneming|webshop|zaak)|accepteer (?:alle |direct |eenvoudig )?(?:betaalmethoden|betalingen|ideal|creditcards?|pinbetalingen)|betaalmethoden accepteren|betaallinks?|terugkerende betalingen|abonnementsbetalingen|betaalverzoeken|accept (?:all |every )?(?:payment methods|cards|card payments)|payment links?|recurring payments|zahlungen (?:akzeptieren|annehmen)|accepter (?:les )?paiements|financial technology platform|payments? company)(?![\p{L}])/iu;
// Pay-later is a provider's product only when the provider names the shops it
// works with ("bij je favoriete winkels", "for merchants"); a fashion shop that
// offers "betaal later met Klarna" is a shop.
const payLater = /(?<![\p{L}])(?:buy now,? pay later|betaal later|achteraf betalen|gespreid betalen|in 3 (?:delen|termijnen)|pay in (?:3|4|30 days)|später bezahlen|ratenzahlung)(?![\p{L}])/iu;
const merchantNetwork = /(?<![\p{L}])(?:(?:je |jouw |uw |your )?favoriete (?:winkels|webshops)|duizenden (?:winkels|webshops)|bij (?:\d[\d.]*|alle|veel) (?:winkels|webshops)|(?:for|voor) (?:merchants|retailers|winkeliers|webwinkeliers)|your favou?rite (?:stores|shops)|thousands of (?:stores|shops|merchants)|lieblingsshops?)(?![\p{L}])/iu;
// "X is the payment platform / een betaaldienstverlener": the organisation's own
// self-description in its meta description is a declaration on its own.
const paymentSelfDeclaration = /\b(?:is|zijn|ist|est|è|es)\s+(?:a|an|the|een|de|het|der|die|das|ein(?:e)?|le|la|un(?:e)?|il)\s+(?:[\p{L}-]+\s+){0,4}(?:payments? (?:platform|provider|company|service provider)|financial technology (?:platform|company)|fintech(?: company)?|betaal(?:dienstverlener|platform|provider)|zahlungs(?:dienstleister|anbieter|plattform)|prestataire de paiement)\b/iu;
// In-store PAYMENTS ("betalen in de winkel", "payments online and in-store") are a
// payment product, not retail sales language.
const inStorePayments = /\b(?:betalen|betalingen|betaalmethoden|pinnen|pinbetalingen|betaalterminals?|payments?|payment methods|zahlungen|zahlungsarten|bezahlen|paiements?)\b[^.!?]{0,40}?\b(?:in de winkel|in-store|in store|instore|im geschäft|vor ort|en magasin)\b/giu;
// Provider navigation: developer documentation next to payment products.
const developerNav = /^(?:developers?|ontwikkelaars?|entwickler|développeurs|api(?: docs| reference)?|documentatie|documentation|docs)$/i;
const paymentNav = /^(?:payments?|betalingen|betaalmethoden|payment methods|online payments|in-person payments|terminals?|checkout|zahlungsarten|moyens de paiement|products?|producten|pricing|prijzen|tarieven)$/i;
// A payment provider names payment as its product to businesses ("Das beste
// Payment für Ihr Business", "payments for your business, online and in-store").
const paymentNoun = /\b(?:payments?|zahlung(?:en)?|bezahlen|paiements?|pagamenti|pagos|betalingen|betalen)\b/i;
const merchantAudience = /\b(?:für ihr (?:business|unternehmen|geschäft)|for your (?:business|company|store)|voor (?:je|jouw|uw) (?:bedrijf|onderneming|zaak)|pour votre (?:entreprise|commerce|activité)|per la tua (?:azienda|attività)|para tu (?:negocio|empresa)|online,? (?:instore|in-store|in store)|omnichannel|point of sale|kassensystem|kartenterminal|betaalterminal|payment terminal)\b/i;
const contextualFinancialSchema = new Set([
  "financialservice", "bankorcreditunion", "paymentservice",
  "paymentcard", "creditcard", "loanorcredit", "financialproduct",
]);
// Unambiguous lodging words. "camping", "campground" and "resort" are also
// product categories (tents, resort wear), so they only count with stay wording.
// German/Dutch compounds ("Premiumhotels", "Stadthotel") name lodging too.
const lodgingCompound = /(?<![\p{L}])\p{L}{3,}hotels?(?![\p{L}])/iu;
const lodgingPurpose = /\b(?:hotel(?:s)?|hostel(?:s)?|guesthouse|guest house|bed and breakfast|b&b|accommodation|accommodatie|lodging|overnight stays?|overnachten|overnachtingen|hotelkamers?|kamers (?:boeken|reserveren)|book (?:a |your )?(?:room|stay)|book rooms?|room reservations?|vakantiehuizen?|vakantiewoningen?|vakantiepark|bungalowpark|holiday rental|vacation rental|holiday home|holiday park|overnight accommodation|ferienwohnung(?:en)?|ferienhaus|unterkunft|hébergement|alloggio|alojamiento)\b/i;
const ambiguousLodging = /\b(?:camping|campground|campsite|glamping|resort|chaletpark)\b/i;
const stayWording = /\b(?:overnacht(?:en|ing(?:en)?)|kampeerplaats(?:en)?|kampeerplek(?:ken)?|staanplaats(?:en)?|pitch(?:es)?|plaatsen boeken|chalets?|bungalows?|stacaravans?|accommodaties?|accommodation|book (?:a |your )?(?:pitch|stay)|reserveer|reserveren|boek (?:je|uw) (?:plek|verblijf)|verblijf|stay|nights?|nachten)\b/i;
const accommodationSchema = new Set([
  "hotel", "hotelroom", "lodgingbusiness", "bedandbreakfast",
  "vacationrental", "resort", "campground", "hostel",
]);

import { isPublication, stripAudience } from "./eu-identity.ts";

export function detectPrimaryBusinessIdentity(input: {
  title?: string;
  description?: string;
  headings?: string[];
  schemaTypes?: string[];
  /** Main navigation labels of the page (identity support only, never alone). */
  navigation?: string[];
}): PrimaryBusinessIdentity {
  // Audience clauses ("IT-Dienstleister für Banken und Versicherungen") name
  // customers, not the company's own financial or lodging business.
  const title = stripAudience((input.title || "").slice(0, 300));
  const description = stripAudience((input.description || "").slice(0, 600));
  const heading = stripAudience((input.headings || []).slice(0, 3).join(" ").slice(0, 400));
  const schema = new Set((input.schemaTypes || []).map((v) => v.toLowerCase()));
  // A blog or magazine about money or travel is a publication, not a bank or hotel.
  if (isPublication(title, input.schemaTypes || [])) return { sector: "unknown", confidence: "low", confidenceScore: 0, evidence: [] };
  const identityText = [title, description, heading].join(" ");
  // "voor webshops" / "for online stores" names the provider's customers, not
  // something the provider sells itself; remove such audience phrases first.
  const ownOffer = identityText.replace(/\b(?:(?:voor|for|für|pour|per|para)\s+(?:je |jouw |uw |your |ihre |votre |online |alle |every |all )?|(?:in|op|met|on|into|with|dans)\s+(?:je|jouw|uw|your|ihrem|votre)\s+)(?:webshops?|webwinkels?|online[- ]?(?:stores?|shops?|winkels?)|onlineshops?|e-?commerce(?:[- ](?:businesses|bedrijven|merchants))?|merchants?|retailers?|winkels?|ondernemers|businesses|bedrijven)\b/gi, " ");
  const retailSeller = retailSalesLanguage.test(ownOffer.replace(inStorePayments, " "));
  const network = merchantNetwork.test(identityText);
  const offerTitle = providerOffer.test(title) || (network && payLater.test(title));
  const offerDescription = providerOffer.test(description) || paymentSelfDeclaration.test(description) || (network && payLater.test(description));
  const offerHeading = providerOffer.test(heading) || (network && payLater.test(heading));
  const nav = (input.navigation || []).map((label) => label.trim());
  const providerNavigation = nav.some((label) => developerNav.test(label)) && nav.some((label) => paymentNav.test(label)) && paymentNoun.test(identityText);
  const paymentTitle = paymentPurpose.test(title) || offerTitle;
  const paymentDescription = paymentPurpose.test(description) || offerDescription;
  const paymentHeading = paymentPurpose.test(heading) || offerHeading;
  const financeSchema = [...schema].some((t) => contextualFinancialSchema.has(t));
  const financeTextSources = Number(paymentTitle) + Number(paymentDescription) + Number(paymentHeading);
  // Two independent identity sources, or one plus typed financial schema.
  // A retailer's own sales language overrides generic money wording.
  const merchantPayments = !retailSeller && paymentNoun.test(title) && paymentNoun.test(description) && merchantAudience.test(description);
  // Independent sources: title, description, heading, typed schema, provider
  // navigation (developer docs + payment products), or an explicit self-declaration.
  const selfDeclared = paymentSelfDeclaration.test(description);
  const paymentsProven = !retailSeller && (merchantPayments ||
    (paymentTitle && paymentDescription)
    || financeTextSources >= 2
    || (financeTextSources >= 1 && (financeSchema || providerNavigation || selfDeclared)));
  const bankingTerms = new Set((identityText.match(new RegExp(bankingPurpose.source, "gi")) || []).map((term) => term.toLowerCase()));
  const insuranceProven = !retailSeller && (schema.has("insuranceagency") || insurancePurpose.test(title));
  const bankingProven = !retailSeller && (bankingTerms.size >= 2 || (bankingTerms.size >= 1 && financeSchema));
  // A full-service bank also sells insurance: two banking terms decide first.
  const financialKind: PrimaryBusinessIdentity["financialKind"] = paymentsProven ? "payments"
    : bankingTerms.size >= 2 && bankingProven ? "banking"
    : insuranceProven ? "insurance"
    : bankingProven ? "banking" : undefined;
  const financeProven = Boolean(financialKind);
  const lodgingTitle = lodgingPurpose.test(title) || lodgingCompound.test(title) || (ambiguousLodging.test(title) && !retailSeller && stayWording.test(identityText));
  // Once the title names lodging, stay wording (pitches, chalets, "reserveer je
  // verblijf") in the description or heading is an independent second source.
  const stayBacked = (text: string) => lodgingTitle && !retailSeller && stayWording.test(text);
  const lodgingDescription = lodgingPurpose.test(description) || lodgingCompound.test(description) || (ambiguousLodging.test(description) && !retailSeller && stayWording.test(identityText)) || stayBacked(description);
  const lodgingHeading = lodgingPurpose.test(heading) || (ambiguousLodging.test(heading) && !retailSeller && stayWording.test(identityText)) || stayBacked(heading);
  const lodgingSchema = [...schema].some((t) => accommodationSchema.has(t));
  const lodgingTextSources = Number(lodgingTitle) + Number(lodgingDescription) + Number(lodgingHeading);
  // Lodging MUST be supported by the company's own identity or typed schema.
  // 'arrival', 'departure', 'guests', and generic booking/checkout terms in
  // page body alone are never enough for hotel classification. A shop that
  // sells camping gear or resort wear is retail, not accommodation.
  const lodgingProven = lodgingSchema || (!retailSeller && lodgingTitle && (lodgingDescription || lodgingHeading));

  if (financeProven && !lodgingSchema) {
    return {
      sector: "financial_services",
      financialKind,
      confidence: "high",
      confidenceScore: financeSchema ? 96 : 92,
      evidence: [
        financialKind === "banking" ? "Bedrijfsidentiteit bevestigt bank-/financiële producten" : "",
        financialKind === "insurance" ? "Bedrijfsidentiteit bevestigt verzekeringen" : "",
        paymentTitle && financialKind === "payments" ? "Bedrijfsidentiteit in titel bevestigt financiële/betaaldiensten" : "",
        paymentDescription && financialKind === "payments" ? "Bedrijfsomschrijving bevestigt financiële/betaaldiensten" : "",
        paymentHeading && financialKind === "payments" ? "Hoofdkop bevestigt financiële/betaaldiensten" : "",
        financeSchema ? "Aanvullend financieel structured-data-signaal" : "",
      ].filter(Boolean),
    };
  }
  if (lodgingProven && !financeProven) {
    return {
      sector: "hospitality",
      confidence: "high",
      confidenceScore: lodgingSchema && lodgingTextSources ? 96 : lodgingSchema ? 90 : 90,
      evidence: [
        lodgingTitle ? "Bedrijfsidentiteit in titel bevestigt accommodatie" : "",
        lodgingDescription ? "Bedrijfsomschrijving bevestigt accommodatie" : "",
        lodgingHeading ? "Hoofdkop bevestigt accommodatie" : "",
        lodgingSchema ? "Accommodatie-schema bevestigt bedrijfsactiviteit" : "",
      ].filter(Boolean),
    };
  }
  // Ambiguous evidence must not turn into 90%+ confidence.
  return {sector:"unknown", confidence:"low", confidenceScore:0, evidence:[]};
}

/** Site homepage aliases are determined by URL structure, never commerce text.
 * /us/home, /nl/home, /en-gb/home are homepages; /products/home isn't.
 */
export function isSiteHomepagePath(path: string): boolean {
  const normalized = (path || "/").split("?")[0].replace(/\/+$/, "") || "/";
  // Generic start-page names in the main EU languages, optionally as a server
  // page (/en/home.html, /it-it/homepage.html, /start, /de/startseite).
  const HOME_SUFFIX = /^(?:home|homepage|index|start|startseite|startpagina|accueil|inicio|portada|pagina-iniziale)(?:\.(?:html?|php|aspx?|jsp))?$/i;
  if (normalized === "/" || HOME_SUFFIX.test(normalized.slice(1))) return true;
  const pieces = normalized.split("/").filter(Boolean).map((p) => p.toLowerCase());
  if (!pieces.length || pieces.length > 3) return false;
  const isHomeSuffix = HOME_SUFFIX.test(pieces[pieces.length - 1]);
  const marketPieces = isHomeSuffix ? pieces.slice(0, -1) : pieces;
  if (!marketPieces.length || marketPieces.length > 2) return false;
  const markets = new Set([
    "us","uk","gb","au","ca","nz","nl","be","de","at","ch","fr","es","it","pt",
    "ie","pl","se","no","dk","fi","cz","sk","hu","ro","bg","gr","hr","lu","lv",
    "lt","ee","si","cy","mt","jp","br","mx","in","sg","en","cs","el","sv","da",
    "int","intl","global","eu",
  ]);
  return marketPieces.every((p) => (
    markets.has(p) || /^[a-z]{2}[-_][a-z]{2}$/.test(p) && markets.has(p.slice(0, 2))
  ));
}
