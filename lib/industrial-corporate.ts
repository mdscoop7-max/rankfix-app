/**
 * Evidence for industry/technology corporate sites without a descriptive homepage.
 * Only an independently checked company/about page plus supporting first-party
 * sector evidence may establish this primary economic activity.
 */
export function industrialCorporateEvidence(input:{
 homeHeadings:string[];
 pages:Array<{url:string;type:string;identityText:string;ownIdentityText:string}>;
}):null|{sector:"manufacturing_industrial";subtype:"industrial_technology_group";confidenceScore:number;evidence:string[]}{
 const headings=input.homeHeadings.join(" ").toLowerCase();
 const pages=input.pages.filter(p=>p.identityText.length>30);
 const corporate=pages.filter(p=>p.type==="corporate"||/\/(?:unternehmen|company|about-us|corporate|over-ons)(?:\/|$)/i.test(new URL(p.url).pathname));
 const SELF_DESCRIPTION=/\b(?:technologie.{0,32}dienstleistungsunternehmen|industrie.{0,25}(?:konzern|unternehmen)|technology.{0,20}(?:and services )?(?:group|company)|industr(?:ial|ie).{0,18}(?:manufactur|group|technology)|global.{0,20}technolog(?:y|ie)unternehmen|entwickel\w*.{0,25}(?:fertig|herstell))\b/i;
 const industrial=/\b(?:industrie|industrial technology|industry|manufactur|production|fertigung|automatisierung|automation|engineering|maschinenbau|antriebstechnik|control technology|elektrotechnik|hardware|mobilit[aä]t|mobility)\b/i;
 const corp=corporate.find(p=>SELF_DESCRIPTION.test(p.identityText)&&industrial.test(p.identityText));
 const businessSections=industrial.test(headings) && /\b(?:geschäftskunden|business customers|industrie|industry|business solutions|industrie und handwerk)\b/i.test(headings);
 const operationalPages=pages.filter(p=>p.url!==corp?.url && ["service","other","corporate"].includes(p.type) && industrial.test(p.ownIdentityText));
 if(!corp || !(businessSections || operationalPages.length>=1))return null;
 return {
   sector:"manufacturing_industrial",subtype:"industrial_technology_group",
   confidenceScore:businessSections && operationalPages.length>=1 ? 91 : 82,
   evidence:[
    "Bedrijfsomschrijving bevestigt technologie-/industrieconcern: "+corp.url,
    businessSections?"Homepage-secties tonen industriële technologie voor zakelijke klanten":"Andere eigen pagina's bevestigen industrie: "+operationalPages.slice(0,2).map(p=>p.url).join(", "),
   ]
 };
}
