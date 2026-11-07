/**
 * Independent business-register evidence for the RankFix Sector Motor.
 * No network requests. Providers need their own credentials, terms and rate limits.
 * A registry code is a registered economic activity, not proof of a website's offer.
 */
export type RegistryActivity = {
  scheme: "NACE" | "SBI" | "NAF" | "NACE_REV_2_1";
  code: string;
  primary: boolean;
};
export type RegistryRecord = {
  source: string;
  country: string;
  registrationNumber?: string;
  vatNumber?: string;
  legalName?: string;
  tradeNames?: string[];
  activities?: RegistryActivity[];
  retrievedAt?: string;
  sourceUrl?: string;
};
export type SiteLegalEvidence = {
  country?: string;
  registrationNumbers?: string[];
  vatNumbers?: string[];
  legalNames?: string[];
};
export type RegisteredIndustryMapping = {
  scheme: RegistryActivity["scheme"];
  code: string;
  sector: string;
  label: string;
};
export type RegistryResolution = {
  status: "verified" | "unconfirmed" | "conflict" | "unavailable";
  matchedBy?: "registration_number" | "vat_number";
  companyName?: string;
  industryHint?: { sector: string; label: string; code: string; scheme: string };
  evidence: string[];
  websiteSectorConfirmed: false;
};
const clean=(v: string|undefined)=>(v||"").normalize("NFKC").trim();
const country=(v: string|undefined)=>clean(v).toUpperCase();
const registration=(v: string|undefined)=>clean(v).toUpperCase().replace(/[\s.\-]/g,"");
const vat=(v: string|undefined)=>clean(v).toUpperCase().replace(/[\s.\-]/g,"");
const legal=(v: string|undefined)=>clean(v).toLocaleLowerCase("und").replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim();
const matchId=(provided:string[],actual:string|undefined,normalize:(s:string|undefined)=>string)=>
  Boolean(actual&&normalize(actual)&&provided.some(x=>normalize(x)===normalize(actual)));
export function reconcileCompanyRegistry(site:SiteLegalEvidence,records:RegistryRecord[],mappings:RegisteredIndustryMapping[]=[]):RegistryResolution {
  const no=(status:RegistryResolution["status"],reason:string):RegistryResolution=>({status,evidence:[reason],websiteSectorConfirmed:false});
  if(!records.length)return no("unavailable","Geen toegankelijke of toegestane registergegevens ontvangen.");
  if(!site.country||!(site.registrationNumbers?.length||site.vatNumbers?.length))
    return no("unconfirmed","Geen eigen bedrijfsland plus inschrijvings- of btw-nummer: registermatch niet mogelijk.");
  const candidates=records.filter(r=>country(site.country)===country(r.country)).flatMap(r=>{
    const id=matchId(site.registrationNumbers||[],r.registrationNumber,registration);
    const v=matchId(site.vatNumbers||[],r.vatNumber,vat);
    return id||v?[{record:r,matchedBy:id?"registration_number" as const:"vat_number" as const}]:[];
  });
  if(!candidates.length)return no("unconfirmed","Geen registerrecord met identiek land en officieel identificatienummer.");
  const identities=new Set(candidates.map(({record})=>registration(record.registrationNumber)||vat(record.vatNumber)));
  if(identities.size>1)return no("conflict","Meerdere verschillende ondernemingen matchen; geen automatische keuze.");
  const knownNames=(site.legalNames||[]).map(legal).filter(Boolean);
  const matchingNames=candidates.filter(({record})=>
    !knownNames.length||[record.legalName,...(record.tradeNames||[])].some(name=>knownNames.includes(legal(name))));
  if(!matchingNames.length)return no("conflict","Nummer klopt maar naam wijkt af van de wettelijke website-identiteit.");
  const {record,matchedBy}=matchingNames[0];
  const activity=(record.activities||[]).find(a=>a.primary&&mappings.some(m=>m.scheme===a.scheme&&m.code===a.code));
  const mapping=activity?mappings.find(m=>m.scheme===activity.scheme&&m.code===activity.code):undefined;
  return {
    status:"verified",matchedBy,companyName:record.legalName||record.tradeNames?.[0],
    industryHint:mapping&&activity?{sector:mapping.sector,label:mapping.label,code:activity.code,scheme:activity.scheme}:undefined,
    evidence:[
      record.source+": "+record.country+"; "+(matchedBy==="vat_number"?"btw-nummer":"registratienummer")+" komt exact overeen",
      knownNames.length?"Gepubliceerde bedrijfsnaam bevestigd":"Website gaf geen wettelijk bevestigde bedrijfsnaam",
      mapping&&activity?"Geregistreerde hoofdactiviteit: "+activity.scheme+" "+activity.code:"Geen gevalideerde bedrijfstakcode beschikbaar",
    ],
    websiteSectorConfirmed:false,
  };
}
