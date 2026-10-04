export type AdsEntityType = "brand" | "product" | "category" | "service" | "marketing-copy" | "navigation" | "unknown";
export type AdsIntent = "commercial-transactional" | "local" | "navigational-brand" | "informational" | "ambiguous";
export type AdsConfidence = "high" | "medium" | "low";

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
  organizationName: string;
  siteName: string;
  hasLocalBusinessSchema: boolean;
  hasTrustedLocalEvidence: boolean;
};

type Entity = {
  text: string;
  type: AdsEntityType;
  confidence: AdsConfidence;
  source: "jsonld-product" | "customer-context" | "jsonld-organization" | "og-site-name";
};

const LANGUAGE_ALIASES: Record<string,string> = {
  nederlands:"nl", dutch:"nl", engels:"en", english:"en", duits:"de", german:"de", deutsch:"de",
  frans:"fr", french:"fr", français:"fr", spaans:"es", spanish:"es", español:"es",
  italiaans:"it", italian:"it", italiano:"it",
};
const SALES_MODIFIERS: Record<string,string[]> = {
  nl:["kopen","prijs","bestellen"], en:["buy","price","order"], de:["kaufen","preis","bestellen"],
  fr:["acheter","prix","commander"], es:["comprar","precio","pedir"], it:["comprare","prezzo","ordinare"],
};
const LEAD_MODIFIERS: Record<string,string[]> = {
  nl:["prijs","offerte"], en:["price","quote"], de:["preis","angebot"], fr:["prix","devis"],
  es:["precio","presupuesto"], it:["prezzo","preventivo"],
};
const LOCAL_MODIFIERS: Record<string,string[]> = {
  nl:["in de buurt"], en:["near me"], de:["in der nähe"], fr:["près de moi"], es:["cerca de mí"], it:["vicino a me"],
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
const uniqueEntities=(entities:Entity[])=>{
  const seen=new Set<string>();
  return entities.filter((entity)=>{
    const key=`${entity.type}:${entity.text.toLocaleLowerCase()}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export function buildAdsKeywordIntelligence(input: AdsKeywordInput) {
  const requestedLanguages=unique(input.requestedLanguages.map(normalizeLanguage));
  const detectedLanguage=normalizeLanguage(input.pageLanguage || "");
  const languages=requestedLanguages.length ? requestedLanguages : (detectedLanguage ? [detectedLanguage] : []);
  const countries=unique(input.requestedCountries);
  const goal=input.campaignGoal || (input.productNames.length ? "sales" : "");
  const baseIntent: AdsIntent=goal==="sales" ? "commercial-transactional" : ["leads","calls","appointments","store_visits"].includes(goal) ? "commercial-transactional" : "ambiguous";
  const localIntentConfirmed=input.hasLocalBusinessSchema && input.hasTrustedLocalEvidence;

  const productEntities:Entity[]=unique(input.productNames).map((text)=>({text,type:"product",confidence:"high",source:"jsonld-product"}));
  const customerEntities:Entity[]=unique([input.primaryOffer,input.industry]).map((text)=>({
    text,type:goal==="sales" ? "category" : "service",confidence:"medium",source:"customer-context"
  }));
  const brandText=clean(input.organizationName || input.siteName);
  const brandEntities:Entity[]=brandText ? [{
    text:brandText,type:"brand",confidence:input.organizationName ? "high" : "medium",
    source:input.organizationName ? "jsonld-organization" : "og-site-name"
  }] : [];
  const entities=uniqueEntities([...customerEntities,...productEntities,...brandEntities]).slice(0,10);

  const marketScopes=(countries.length ? countries : [null]).flatMap((country)=>
    (languages.length ? languages : [null]).map((language)=>({
      country,
      language,
      countrySource:country ? "customer" as const : "unknown" as const,
      languageSource:language ? (requestedLanguages.length ? "customer" as const : "html-lang" as const) : "unknown" as const,
    }))
  );

  const marketKeywordGroups=marketScopes.flatMap((market)=>entities.map((entity)=>{
    const language=market.language || "en";
    let intent:AdsIntent=entity.type==="brand" ? "navigational-brand" : baseIntent;
    let modifiers:string[]=[];
    if(entity.type==="product" || entity.type==="category"){
      if(goal==="sales") modifiers=SALES_MODIFIERS[language] || SALES_MODIFIERS.en;
    } else if(entity.type==="service" && baseIntent==="commercial-transactional"){
      modifiers=LEAD_MODIFIERS[language] || LEAD_MODIFIERS.en;
      if(localIntentConfirmed) {
        intent="local";
        modifiers=[...modifiers,...(LOCAL_MODIFIERS[language] || LOCAL_MODIFIERS.en)];
      }
    }
    return {
      theme:entity.text,
      entityType:entity.type,
      intent,
      confidence:entity.confidence,
      evidenceSource:entity.source,
      market,
      landingPage:input.pageUrl,
      keywords:unique([entity.text,...modifiers.map((modifier)=>`${entity.text} ${modifier}`)]).slice(0,8),
    };
  }));

  const requestedExclusions=unique(input.excludeIntent.split(/[,;\n]/));
  const negativeLanguage=languages[0] || "en";
  const negativeKeywordCandidates=unique([...(NEGATIVES[negativeLanguage] || NEGATIVES.en),...requestedExclusions]).map((term)=>({
    term,
    source:requestedExclusions.includes(term) ? "customer" : "suggested",
    requiresReview:true,
    reason:requestedExclusions.includes(term)
      ? "Door de klant opgegeven als niet te promoten; controleer vóór campagne-uitsluiting."
      : "Suggestie op basis van veelvoorkomende afwijkende intentie; controleer vóór campagne-uitsluiting.",
  }));

  const evidenceLevel=productEntities.length || customerEntities.length ? "typed_evidence" : brandEntities.length ? "brand_only" : "insufficient";
  const confirmationStatus=evidenceLevel==="typed_evidence" ? "confirmed" : "unable_to_confirm";

  return {
    evidenceLevel,
    confirmationStatus,
    language:languages[0] || null,
    pageLanguage:detectedLanguage || null,
    intent:baseIntent,
    campaignGoal:goal || null,
    targetArea:input.targetArea || null,
    targetCountries:countries,
    adLanguages:languages,
    markets:marketScopes,
    localIntentConfirmed,
    landingPage:input.pageUrl,
    seedTerms:entities.map((entity)=>entity.text),
    keywordCandidates:unique(marketKeywordGroups.flatMap((group)=>group.keywords)),
    keywordGroups:marketKeywordGroups,
    marketKeywordGroups,
    negativeKeywordCandidates,
    metrics:{searchVolume:"unknown_not_confirmed" as const,cpc:"unknown_not_confirmed" as const,competition:"unknown_not_confirmed" as const,source:null},
    disclaimer:"Keywordkandidaten zijn gebaseerd op getypeerd pagina- of klantbewijs. Doelmarkten worden niet afgeleid uit alleen de paginataal. Zoekvolume, CPC en Google Ads-concurrentie vereisen een actuele externe databron.",
  };
}
