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
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  evidence: string[];
};

const paymentPurpose = /\b(?:payments? (?:platform|processing|processor|provider|gateway|services?|solutions?|infrastructure|technology)|(?:online|in[- ]person|digital) payments?|payment orchestration|accept (?:online |card |digital |in[- ]person )?payments?|process (?:online |card |digital )?payments?|payment service provider|merchant acquiring|fintech|financial services?|digital wallet|mobile wallet|send money|send and save money|pay[, ]+send and save money|paying friends|saving money|transfer money|money transfers?|manage money|manage your money|banking services?|bank account|betaalplatform|betaaldienst(?:verlener)?|betaaloplossingen|betalingen (?:accepteren|verwerken)|betaalverwerking|betaalprovider|geld overmaken|betalingsverkeer)\b/i;
const contextualFinancialSchema = new Set([
  "financialservice", "bankorcreditunion", "paymentservice",
  "paymentcard", "creditcard", "loanorcredit", "financialproduct",
]);
const lodgingPurpose = /\b(?:hotel(?:s)?|hostel(?:s)?|guesthouse|guest house|bed and breakfast|b&b|accommodation|lodging|overnight stays?|overnachten|overnachtingen|hotelkamers?|kamers boeken|book (?:a |your )?(?:room|stay)|book rooms?|room reservations?|vakantiehuizen?|vakantiewoningen?|holiday rental|vacation rental|holiday home|camping|campground|resort|overnight accommodation)\b/i;
const accommodationSchema = new Set([
  "hotel", "hotelroom", "lodgingbusiness", "bedandbreakfast",
  "vacationrental", "resort", "campground", "hostel",
]);

export function detectPrimaryBusinessIdentity(input: {
  title?: string;
  description?: string;
  headings?: string[];
  schemaTypes?: string[];
}): PrimaryBusinessIdentity {
  const title = (input.title || "").slice(0, 300);
  const description = (input.description || "").slice(0, 600);
  const heading = (input.headings || []).slice(0, 3).join(" ").slice(0, 400);
  const schema = new Set((input.schemaTypes || []).map((v) => v.toLowerCase()));
  const paymentTitle = paymentPurpose.test(title);
  const paymentDescription = paymentPurpose.test(description);
  const paymentHeading = paymentPurpose.test(heading);
  const financeSchema = [...schema].some((t) => contextualFinancialSchema.has(t));
  const financeTextSources = Number(paymentTitle) + Number(paymentDescription) + Number(paymentHeading);
  const financeProven = (paymentTitle && paymentDescription)
    || (financeTextSources >= 2 && financeSchema)
    || (financeTextSources >= 2 && (paymentTitle || paymentDescription));
  const lodgingTitle = lodgingPurpose.test(title);
  const lodgingDescription = lodgingPurpose.test(description);
  const lodgingHeading = lodgingPurpose.test(heading);
  const lodgingSchema = [...schema].some((t) => accommodationSchema.has(t));
  const lodgingTextSources = Number(lodgingTitle) + Number(lodgingDescription) + Number(lodgingHeading);
  // Lodging MUST be supported by the company's own identity or typed schema.
  // 'arrival', 'departure', 'guests', and generic booking/checkout terms in
  // page body alone are never enough for hotel classification.
  const lodgingProven = lodgingSchema || (lodgingTitle && (lodgingDescription || lodgingHeading));

  if (financeProven && !lodgingSchema) {
    return {
      sector: "financial_services",
      confidence: "high",
      confidenceScore: financeSchema ? 96 : 92,
      evidence: [
        paymentTitle ? "Bedrijfsidentiteit in titel bevestigt financiële/betaaldiensten" : "",
        paymentDescription ? "Bedrijfsomschrijving bevestigt financiële/betaaldiensten" : "",
        paymentHeading ? "Hoofdkop bevestigt financiële/betaaldiensten" : "",
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
  if (normalized === "/" || /^\/(?:home|index(?:\.html?)?)$/i.test(normalized)) return true;
  const pieces = normalized.split("/").filter(Boolean).map((p) => p.toLowerCase());
  if (pieces.length < 2 || pieces.length > 3 || !/^(?:home|index(?:\.html?)?)$/.test(pieces[pieces.length - 1])) return false;
  const markets = new Set([
    "us","uk","gb","au","ca","nz","nl","be","de","at","ch","fr","es","it","pt",
    "ie","pl","se","no","dk","fi","cz","sk","hu","ro","bg","gr","hr","lu","lv",
    "lt","ee","si","cy","mt","jp","br","mx","in","sg","en","cs","el","sv","da",
  ]);
  return pieces.slice(0, -1).every((p) => (
    markets.has(p) || /^[a-z]{2}[-_][a-z]{2}$/.test(p) && markets.has(p.slice(0, 2))
  ));
}
