/**
 * RankFix QA: evidence-first organisation sector corroboration.
 * Homepage is checked before first-party representative pages. Customer market
 * pages, editorial topics, duplicate titles and generic checkout flows never vote.
 * No external requests or domain/brand lists. Unsupported/conflicted => abstain.
 */
/** @type {Array<[string,string,string,RegExp,RegExp,string[]]>} */
const TYPES = [
  ["cybersecurity","cybersecurity","Cybersecurity & informatiebeveiliging",/\b(?:cyber[- ]?security|cyberbeveiliging|informatiebeveiliging|information security|security operations cent(?:er|re)|incident response services?|managed security services?|cybersécurité)\b/i,/\b(?:threat detection|threat intelligence|ransomware|cyber attacks?|cyberincident(?:en)?|incident response|penetration test(?:ing)?|managed detection|endpoint protection|digital forensics|cybersecurity)\b/i,[]],
  ["waste_recycling","waste_recycling","Afvalverwerking & recycling",/\b(?:waste management|recycling company|recycling services?|recyclingbedrijf|afvalverwerking|afvalinzameling|afvalbeheer|resource recovery|recyclage|déchets|entsorgung|kreislaufwirtschaft)\b/i,/\b(?:waste|afval|recycling|recyclage|materials recovery|resource recovery|circulair|circular|hergebruik|inzameling|sortering|grondstoffen|déchets)\b/i,[]],
  ["sports_organizations","sports_organizations","Sportbond & sportorganisatie",/\b(?:sports? (?:federation|governing body|association|organisation|organization)|sportbond|sportfederatie|sportorganisatie|voetbalbond|football association|olympic committee|olympisch comité|national governing body|fédération sportive|fußballverband)\b/i,/\b(?:sport|clubs?|teams?|competitions?|competities?|wedstrijden|leagues?|members?|leden|football|voetbal|athletes?|sporters?)\b/i,["sportsorganization"]],
  ["maritime_ports","maritime_ports","Havenbedrijf & maritieme infrastructuur",/\b(?:port authority|port of [a-zà-ÿ-]+|havenbedrijf|havenautoriteit|harbour authority|harbor authority|seaport|zeehaven|maritime port|port operator|port operations|terminal operator)\b/i,/\b(?:maritime|shipping|vessels?|ships?|containers?|terminals?|logistiek|logistics|harbour|harbor|haven|cargo|port infrastructure|zeevaart)\b/i,[]],
  ["airports","airports","Luchthaven & luchthavenexploitatie",/\b(?:airport|airports|luchthaven|aéroport|flughafen|aeroporto|aeropuerto|airport operator|airport authority)\b/i,/\b(?:departures?|arrivals?|vluchten?|flights?|passengers?|terminal(?:s)?|runway|destinations?|check[- ]in|aviation|luchtvaart|airlines?|gate(?:s)?)\b/i,["airport"]],
  ["agriculture_horticulture","agriculture_horticulture","Landbouw & tuinbouw",/\b(?:agriculture|agricultural cooperative|horticulture|horticultural|tuinbouw|landbouw|agrarische coöperatie|agrarisch collectief|floriculture|flower auction|bloemenveiling|farmers? cooperative|crop cultivation|teeltbedrijf)\b/i,/\b(?:growers?|telers?|teelt|coöperatie|cooperative|farms?|farmers?|boeren|gewassen|crops?|bloemen|flowers?|horticulture|landbouw|agrarisch)\b/i,[]],
  ["professional_services","legal","Juridische dienstverlening & advocatuur",/\b(?:law firm|legal counsel|legal services?|advocatenkantoor|advocaten|advocaat|juridische dienstverlening|cabinet d.avocats|rechtsanwälte|rechtsanwalt|studio legale|firma de abogados|attorneys? at law)\b/i,/\b(?:legal|juridisch|recht|law|litigation|disputes?|advocacy|advocatuur|practice areas?|rechtsgebied(?:en)?|rechtsadvies|counsel|clients?|advocaten|rechtsanwalt)\b/i,["legalservice","attorney"]],
  ["nonprofit","charities_nonprofits","Goede doelen & hulporganisaties",/\b(?:charity|charitable organi[sz]ation|humanitarian organi[sz]ation|humanitaire organisatie|hulporganisatie|goede doelen?|non[- ]?profit|ngo|stichting|foundation|relief organi[sz]ation|aid organi[sz]ation)\b/i,/\b(?:humanitarian|hulpverlening|steun ons|doneren|donaties?|donate|donation|vrijwilligers?|volunteers?|good cause|missie|our mission|humanitaire hulp|emergency relief|charitable|non[- ]?profit)\b/i,["ngo"]],
  ["events_culture","museum_culture","Museum & cultuur",/\b(?:museum|museums|musée|museo|museen|science museum|art museum|national gallery|kunsthal)\b/i,/\b(?:collectie|collections?|exhibitions?|tentoonstelling(?:en)?|expositie(?:s)?|artworks?|kunstwerken|museum|visitor(?:s)?|bezoekers?|galerie|gallery|culturele)\b/i,["museum"]],
  ["professional_services","architecture_design","Architectuur & ontwerp",/\b(?:architectuurbureau|architectenbureau|architecture firm|architecture studio|architects? practice|architectural practice|architecten|architektenbüro|cabinet d.architecture|estudio de arquitectura)\b/i,/\b(?:building design|ontwerp|architectuur|architecture|projecten|projects|planning|urban design|gebouwen|built environment|interieur)\b/i,[]],
  ["health_wellness","veterinary","Dierenarts & veterinaire zorg",/\b(?:dierenarts|dierenkliniek|dierenziekenhuis|veterinary clinic|veterinary hospital|veterinary care|animal hospital|tierarzt|tierklinik|clinique vétérinaire)\b/i,/\b(?:dieren|huisdieren|pets?|animals?|veterinary|veterinaire|dierenarts|behandeling|treatment|zorg|care|tierarzt|vétérinaire)\b/i,["veterinarycare"]],
];
const OWN_TYPES=new Set(["homepage","corporate","service","listing","category","other"]);
const AUDIENCE_EDITORIAL=/(?:^|\/)(?:industries|industry|branchen|sectors?|sectoren|secteurs?|markets?|markten|mercados|clientes?|customers?|klanten|clients?|case-studies|case-study|use-cases?|referenties|references|testimonials|news|nieuws|blog|insights|press|presse|magazine)(?:\/|$)|\/(?:19|20)\d{2}\//i;
/** @param {unknown} text */
function tidy(text){return String(text||"").normalize("NFKC").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,600);}
/**
 * Detect only a declared own activity from independent head metadata fields.
 * Schema type is an additional source, never a sole proof of exact industry.
 * @param {{title?:string|null,description?:string|null,identityHeadings?:string[],schemaTypes?:string[]}} page
 * @returns {{sector:string,key:string,label:string,score:number,evidence:string[]}|null}
 */
export function detectDeclaredIndustry(page){
  const fields=[tidy(page.title),tidy(page.description),tidy((page.identityHeadings||[]).slice(0,3).join(" "))];
  const schemas=new Set((page.schemaTypes||[]).map(x=>String(x).toLowerCase()));
  const candidates=[];
  for(const [sector,key,label,name,context,types] of TYPES){
    const n=fields.flatMap((text,i)=>name.test(text)?[i]:[]);
    const c=fields.flatMap((text,i)=>context.test(text)?[i]:[]);
    const typed=types.some(t=>schemas.has(t));
    const independent=n.some(i=>c.some(j=>i!==j))||n.length>=2;
    if(!independent && !(typed && (n.length||c.length)))continue;
    const own=fields.join(" ");
    if(key==="agriculture_horticulture" && /\b(?:agricultural equipment|farm machinery|tractors?|landbouwmachines?|software for farmers)\b/i.test(own))continue;
    if(key==="architecture_design" && /\b(?:software architecture|cloud architecture|system architecture|enterprise architecture)\b/i.test(own))continue;
    if(key==="legal" && /\b(?:legal software|legal tech|software for lawyers|legal automation platform)\b/i.test(own))continue;
    if(key==="museum_culture" && /\b(?:museum shop|museum store|museum webshop|museum merchandise)\b/i.test(fields[0]))continue;
    if(key==="airports" && /\b(?:airport parking|airport transfers?|airport taxis?|airport shuttle)\b/i.test(fields[0]) && !types.some(t=>schemas.has(t)))continue;
    candidates.push({sector,key,label,score:n.length*3+(independent?4:0)+(typed?4:0)});
  }
  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length||(candidates[1]&&candidates[0].score<=candidates[1].score+1))return null;
  return {...candidates[0],evidence:["Eigen organisatieactiviteit ondersteund door meerdere onafhankelijke metadata-velden"]};
}
/**
 * @typedef {{url:string,type?:string,status?:string,partialHead?:boolean,title?:string|null,description?:string|null,identityHeadings?:string[],schemaTypes?:string[]}} SitePage
 * @param {string} rootUrl
 * @param {SitePage} homepage
 * @param {SitePage[]} representativePages
 */
export function corroborateDeclaredIndustry(rootUrl,homepage,representativePages){
  const root=new URL(rootUrl);const host=root.hostname.toLowerCase().replace(/^www\./,"");
  const rootPath=root.pathname.replace(/\/+$/,"")||"/";
  const votes=[];const seenPaths=new Set();const seenSignatures=new Set();let homepageVote=null;
  for(const p of [homepage,...representativePages]){
    if(p.status!=="audited"||p.partialHead||!OWN_TYPES.has(p.type||"other"))continue;
    let url;try{url=new URL(p.url);}catch{continue;}
    if(!["http:","https:"].includes(url.protocol)||url.hostname.toLowerCase().replace(/^www\./,"")!==host)continue;
    let path;try{path=decodeURIComponent(url.pathname);}catch{continue;}
    path=path.replace(/\/+$/,"")||"/";
    if(AUDIENCE_EDITORIAL.test(path) ||
      path.split("/").filter(Boolean).slice(0,-1).some(segment=>
        /^(?:(?:.*[-_])?(?:markets?|industries|industry|sectors?|branchen|branches|segments?|marches|mercati|mercados|markten)(?:[-_].*)?|business[-_]types?|voor[-_]wie|fuer[-_]wen|für[-_]wen|who[-_]we[-_]serve|zielgruppen|doelgroepen)$/i.test(segment)))continue;
    const signature=[p.title,p.description,...(p.identityHeadings||[])].map(tidy).join("|").toLowerCase();
    if(!signature.replace(/\|/g,"")||seenPaths.has(path)||seenSignatures.has(signature))continue;
    seenPaths.add(path);seenSignatures.add(signature);
    const d=detectDeclaredIndustry(p);if(!d)continue;
    const vote={...d,url:url.toString()};votes.push(vote);
    if(path===rootPath)homepageVote=vote;
  }
  const byKey=new Map();
  for(const v of votes){const a=byKey.get(v.key)||[];a.push(v);byKey.set(v.key,a);}
  const ranked=[...byKey.entries()].map(([key,pages])=>({key,pages})).sort((a,b)=>b.pages.length-a.pages.length);
  const top=ranked[0],second=ranked[1];
  const enough=Boolean(top&&top.pages.length>=2&&(!second||(top.pages.length>=3&&top.pages.length>=3*second.pages.length)));
  const conflictingHome=Boolean(homepageVote&&top&&homepageVote.key!==top.key);
  const homepageAnchored=Boolean(top&&(homepageVote?.key===top.key||(!homepageVote&&top.pages.length>=3)));
  const decision=enough&&homepageAnchored&&!conflictingHome&&top?{
    sector:top.pages[0].sector,key:top.key,label:top.pages[0].label,
    confidence:"medium",confidenceScore:homepageVote?Math.min(90,80+top.pages.length*4):76,
    evidence:top.pages.slice(0,4).map(p=>p.url+": "+p.evidence.join("; ")),
  }:null;
  return {decision,reason:conflictingHome?"homepage_conflict":!top?"no_evidence":!enough?"insufficient_or_conflicting_pages":!homepageAnchored?"homepage_not_corroborated":"corroborated_homepage_and_pages",homepageIdentity:homepageVote?.key||null,supportingPages:top?.pages.length||0,candidates:ranked.map(r=>({key:r.key,count:r.pages.length,urls:r.pages.map(p=>p.url)}))};
}
