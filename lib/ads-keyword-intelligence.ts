export type AdsEntityType = "brand" | "product" | "category" | "service" | "marketing-copy" | "unknown";

export type AdsKeywordInput = {
  pageUrl: string;
  pageLanguage: string;
  requestedLanguages: string[];
  requestedCountries: string[];
  targetArea: string;
  campaignGoal: string;
  industry: string;
  primaryOffer: string;
  excludeIntent: string;
  productNames: string[];
  siteName: string;
};

const LANGUAGE_ALIASES: Record<string,string> = {
  nederlands:"nl", dutch:"nl", engels:"en", english:"en", duits:"de", german:"de", deutsch:"de",
  frans:"fr", french:"fr", français:"fr", spaans:"es", spanish:"es", español:"es",
  italiaans:"it", italian:"it", italiano:"it",
};

const MODIFIERS: Record<string,string[]> = {
  nl:["kopen","prijs","bestellen"], en:["buy","price","order"], de:["kaufen","preis","bestellen"],
  fr:["acheter","prix","commander"], es:["comprar","precio","pedir"], it:["comprare","prezzo","ordinare"],
};

const NEGATIVES: Record<string,string[]> = {
  nl:["gratis","vacature","handleiding","tweedehands"], en:["free","jobs","manual","used"],
  de:["kostenlos","jobs","anleitung","gebraucht"], fr:["gratuit","emploi","manuel","occasion"],
  es:["gratis","empleo","manual","segunda mano"], it:["gratis","lavoro","manuale","usato"],
};

const clean=(value:string)=>value.replace(/\s+/g," ").trim().slice(0,120);
const normalizeLanguage=(value:string)=>{
  const normalized=value.toLowerCase().trim();
  return LANGUAGE_ALIASES[normalized] || normalized.split("-")[0];
};
const unique=(values:string[])=>[...new Set(values.map(clean).filter((v)=>v.length>=3))];

export function buildAdsKeywordIntelligence(input: AdsKeywordInput) {
  const languages=unique(input.requestedLanguages.length ? input.requestedLanguages.map(normalizeLanguage) : [normalizeLanguage(input.pageLanguage || "en")]);
  const countries=unique(input.requestedCountries);
  const primaryLanguage=languages[0] || "en";
  const goal=input.campaignGoal || (input.productNames.length ? "sales" : "");
  const intent=goal==="sales" ? "transactional" : ["leads","calls","appointments","store_visits"].includes(goal) ? "commercial" : "mixed";

  // Customer-entered offer/industry and exact Product schema names are strong evidence.
  // Generic H1/title copy is deliberately excluded: it may be a slogan or welcome text.
  const productEntities=unique(input.productNames).map((text)=>({text,type:"product" as AdsEntityType,confidence:"high",source:"jsonld-product"}));
  const customerEntities=unique([input.primaryOffer,input.industry]).map((text)=>({
    text,type:(goal==="sales" ? "category" : "service") as AdsEntityType,confidence:"medium",source:"customer-context"
  }));
  const brandEntities=unique([input.siteName]).map((text)=>({text,type:"brand" as AdsEntityType,confidence:"medium",source:"site-identity"}));
  const entities=[...customerEntities,...productEntities,...brandEntities];

  const marketScopes=countries.length
    ? countries.flatMap((country)=>languages.map((language)=>({country,language,countrySource:"customer" as const,languageSource:input.requestedLanguages.length ? "customer" as const : "html-lang" as const})))
    : languages.map((language)=>({country:null,language,countrySource:"unknown" as const,languageSource:input.requestedLanguages.length ? "customer" as const : "html-lang" as const}));

  const keywordGroups=entities.slice(0,8).map((entity)=>{
    const canUseCommercialModifiers=goal==="sales" && (entity.type==="product" || entity.type==="category");
    const modifiers=canUseCommercialModifiers ? (MODIFIERS[primaryLanguage] || MODIFIERS.en) : [];
    return {
      theme:entity.text,
      entityType:entity.type,
      intent:entity.type==="brand" ? "navigational-brand" : intent,
      confidence:entity.confidence,
      evidenceSource:entity.source,
      landingPage:input.pageUrl,
      keywords:unique([entity.text,...modifiers.map((modifier)=>`${entity.text} ${modifier}`)]).slice(0,8),
    };
  });

  const requestedExclusions=unique(input.excludeIntent.split(/[,;\n]/));
  const negativeKeywordCandidates=unique([...(NEGATIVES[primaryLanguage] || NEGATIVES.en),...requestedExclusions]).map((term)=>({
    term,
    source:requestedExclusions.includes(term) ? "customer" : "suggested",
    requiresReview:true,
    reason:requestedExclusions.includes(term)
      ? "Door de klant opgegeven als niet te promoten; controleer vóór campagne-uitsluiting."
      : "Suggestie op basis van veelvoorkomende afwijkende intentie; controleer vóór campagne-uitsluiting.",
  }));

  return {
    evidenceLevel: productEntities.length || customerEntities.length ? "typed_evidence" : brandEntities.length ? "brand_only" : "insufficient",
    language:primaryLanguage || null,
    intent,
    campaignGoal:goal || null,
    targetArea:input.targetArea || null,
    targetCountries:countries,
    adLanguages:languages,
    markets:marketScopes,
    landingPage:input.pageUrl,
    seedTerms:entities.map((entity)=>entity.text),
    keywordCandidates:unique(keywordGroups.flatMap((group)=>group.keywords)),
    keywordGroups,
    negativeKeywordCandidates,
    metrics:{searchVolume:null,cpc:null,competition:null,source:null},
    disclaimer:"Keywordkandidaten zijn gebaseerd op aantoonbare pagina- of klantcontext. Zoekvolume, CPC en Google Ads-concurrentie worden pas getoond wanneer een actuele externe databron is gekoppeld.",
  };
}
