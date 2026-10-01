export type CommerceLanguage = "nl"|"en"|"de"|"fr"|"it"|"es";
export type CommerceAuditLike = {
  url?: unknown; kind?: unknown; error?: unknown;
  title?: unknown; description?: unknown; h1?: unknown; canonical?: unknown;
  productSchema?: unknown; offerSchema?: unknown; breadcrumbSchema?: unknown;
  priceSignal?: unknown; availabilitySignal?: unknown; imageSignal?: unknown;
};

type Copy = { title:string; message:string; fix:string };
export type CommerceFinding = {
  category:"ecommerce"; title:string; status:"PASS"|"FAIL"; issue_status:"PASS"|"FAIL";
  message:string; fix:string; issue_id:string; severity:"HIGH"|"MEDIUM";
  confidence:"high"; fix_status?:"WAITING"|"DONE"; evidence:{found:string;details:string};
};

const supported: CommerceLanguage[]=["nl","en","de","fr","it","es"];
export function commerceLanguage(value:unknown):CommerceLanguage {
  const v=String(value||"nl").toLowerCase().split("-")[0] as CommerceLanguage;
  return supported.includes(v)?v:"nl";
}

const COPY:Record<CommerceLanguage,Record<string,Copy>>={
 nl:{
  TITLE:{title:"Title op webshop-pagina",message:"De title van deze {kind}pagina is {state}.",fix:"Voeg een unieke, relevante title toe."},
  DESCRIPTION:{title:"Meta description op webshop-pagina",message:"De meta description van deze {kind}pagina is {state}.",fix:"Voeg een passende meta description toe."},
  H1:{title:"H1 op webshop-pagina",message:"De H1 van deze {kind}pagina is {state}.",fix:"Gebruik één duidelijke H1."},
  CANONICAL:{title:"Canonical op webshop-pagina",message:"De canonical van deze {kind}pagina is {state}.",fix:"Voeg een correcte self-referencing canonical toe."},
  BREADCRUMB_SCHEMA:{title:"Breadcrumb schema",message:"BreadcrumbList structured data is {state}.",fix:"Voeg correcte BreadcrumbList structured data toe."},
  IMAGE:{title:"Afbeelding op webshop-pagina",message:"Een relevante afbeelding is {state}.",fix:"Zorg voor een relevante product- of categorieafbeelding."},
  PRODUCT_SCHEMA:{title:"Product schema",message:"Product structured data is {state}.",fix:"Voeg geldige Product structured data toe."},
  OFFER_SCHEMA:{title:"Offer schema",message:"Offer of AggregateOffer structured data is {state}.",fix:"Voeg actuele aanbodgegevens via Offer structured data toe."},
  PRICE:{title:"Productprijs",message:"Een zichtbare productprijs is {state}.",fix:"Toon een actuele productprijs."},
  AVAILABILITY:{title:"Voorraadstatus",message:"Een voorraadstatus is {state}.",fix:"Toon een actuele voorraadstatus."}
 },
 en:{
  TITLE:{title:"Store page title",message:"The title on this {kind} page is {state}.",fix:"Add a unique, relevant title."},
  DESCRIPTION:{title:"Store page meta description",message:"The meta description on this {kind} page is {state}.",fix:"Add a suitable meta description."},
  H1:{title:"Store page H1",message:"The H1 on this {kind} page is {state}.",fix:"Use one clear H1."},
  CANONICAL:{title:"Store page canonical",message:"The canonical on this {kind} page is {state}.",fix:"Add a correct self-referencing canonical."},
  BREADCRUMB_SCHEMA:{title:"Breadcrumb schema",message:"BreadcrumbList structured data is {state}.",fix:"Add valid BreadcrumbList structured data."},
  IMAGE:{title:"Store page image",message:"A relevant image is {state}.",fix:"Provide a relevant product or category image."},
  PRODUCT_SCHEMA:{title:"Product schema",message:"Product structured data is {state}.",fix:"Add valid Product structured data."},
  OFFER_SCHEMA:{title:"Offer schema",message:"Offer or AggregateOffer structured data is {state}.",fix:"Add current offer data with Offer structured data."},
  PRICE:{title:"Product price",message:"A visible product price is {state}.",fix:"Show a current product price."},
  AVAILABILITY:{title:"Availability",message:"Availability information is {state}.",fix:"Show current availability."}
 },
 de:{
  TITLE:{title:"Seitentitel im Shop",message:"Der Titel dieser {kind}-Seite ist {state}.",fix:"Füge einen eindeutigen, relevanten Titel hinzu."},
  DESCRIPTION:{title:"Meta-Beschreibung im Shop",message:"Die Meta-Beschreibung dieser {kind}-Seite ist {state}.",fix:"Füge eine passende Meta-Beschreibung hinzu."},
  H1:{title:"H1 im Shop",message:"Die H1 dieser {kind}-Seite ist {state}.",fix:"Verwende eine klare H1."},
  CANONICAL:{title:"Canonical im Shop",message:"Der Canonical dieser {kind}-Seite ist {state}.",fix:"Füge einen korrekten selbstreferenzierenden Canonical hinzu."},
  BREADCRUMB_SCHEMA:{title:"Breadcrumb-Schema",message:"BreadcrumbList-Strukturdaten sind {state}.",fix:"Füge gültige BreadcrumbList-Strukturdaten hinzu."},
  IMAGE:{title:"Bild im Shop",message:"Ein relevantes Bild ist {state}.",fix:"Füge ein relevantes Produkt- oder Kategoriebild hinzu."},
  PRODUCT_SCHEMA:{title:"Product-Schema",message:"Product-Strukturdaten sind {state}.",fix:"Füge gültige Product-Strukturdaten hinzu."},
  OFFER_SCHEMA:{title:"Offer-Schema",message:"Offer- oder AggregateOffer-Strukturdaten sind {state}.",fix:"Füge aktuelle Angebotsdaten hinzu."},
  PRICE:{title:"Produktpreis",message:"Ein sichtbarer Produktpreis ist {state}.",fix:"Zeige einen aktuellen Produktpreis."},
  AVAILABILITY:{title:"Verfügbarkeit",message:"Verfügbarkeitsinformationen sind {state}.",fix:"Zeige die aktuelle Verfügbarkeit."}
 },
 fr:{
  TITLE:{title:"Titre de page boutique",message:"Le titre de cette page {kind} est {state}.",fix:"Ajoutez un titre unique et pertinent."},
  DESCRIPTION:{title:"Méta-description boutique",message:"La méta-description de cette page {kind} est {state}.",fix:"Ajoutez une méta-description adaptée."},
  H1:{title:"H1 de page boutique",message:"Le H1 de cette page {kind} est {state}.",fix:"Utilisez un H1 clair."},
  CANONICAL:{title:"Canonical de page boutique",message:"La canonical de cette page {kind} est {state}.",fix:"Ajoutez une canonical auto-référente correcte."},
  BREADCRUMB_SCHEMA:{title:"Schéma Breadcrumb",message:"Les données BreadcrumbList sont {state}.",fix:"Ajoutez des données BreadcrumbList valides."},
  IMAGE:{title:"Image de page boutique",message:"Une image pertinente est {state}.",fix:"Ajoutez une image produit ou catégorie pertinente."},
  PRODUCT_SCHEMA:{title:"Schéma Product",message:"Les données Product sont {state}.",fix:"Ajoutez des données Product valides."},
  OFFER_SCHEMA:{title:"Schéma Offer",message:"Les données Offer ou AggregateOffer sont {state}.",fix:"Ajoutez des données d’offre à jour."},
  PRICE:{title:"Prix du produit",message:"Un prix visible est {state}.",fix:"Affichez un prix actuel."},
  AVAILABILITY:{title:"Disponibilité",message:"La disponibilité est {state}.",fix:"Affichez la disponibilité actuelle."}
 },
 it:{
  TITLE:{title:"Titolo pagina negozio",message:"Il titolo di questa pagina {kind} è {state}.",fix:"Aggiungi un titolo unico e pertinente."},
  DESCRIPTION:{title:"Meta description negozio",message:"La meta description di questa pagina {kind} è {state}.",fix:"Aggiungi una meta description adeguata."},
  H1:{title:"H1 pagina negozio",message:"L'H1 di questa pagina {kind} è {state}.",fix:"Usa un H1 chiaro."},
  CANONICAL:{title:"Canonical pagina negozio",message:"La canonical di questa pagina {kind} è {state}.",fix:"Aggiungi una canonical autoreferenziale corretta."},
  BREADCRUMB_SCHEMA:{title:"Schema Breadcrumb",message:"I dati BreadcrumbList sono {state}.",fix:"Aggiungi dati BreadcrumbList validi."},
  IMAGE:{title:"Immagine pagina negozio",message:"Un'immagine pertinente è {state}.",fix:"Aggiungi un'immagine prodotto o categoria pertinente."},
  PRODUCT_SCHEMA:{title:"Schema Product",message:"I dati Product sono {state}.",fix:"Aggiungi dati Product validi."},
  OFFER_SCHEMA:{title:"Schema Offer",message:"I dati Offer o AggregateOffer sono {state}.",fix:"Aggiungi dati offerta aggiornati."},
  PRICE:{title:"Prezzo prodotto",message:"Un prezzo visibile è {state}.",fix:"Mostra un prezzo aggiornato."},
  AVAILABILITY:{title:"Disponibilità",message:"La disponibilità è {state}.",fix:"Mostra la disponibilità attuale."}
 },
 es:{
  TITLE:{title:"Título de página de tienda",message:"El título de esta página {kind} está {state}.",fix:"Añade un título único y relevante."},
  DESCRIPTION:{title:"Meta description de tienda",message:"La meta description de esta página {kind} está {state}.",fix:"Añade una meta description adecuada."},
  H1:{title:"H1 de página de tienda",message:"El H1 de esta página {kind} está {state}.",fix:"Usa un H1 claro."},
  CANONICAL:{title:"Canonical de tienda",message:"La canonical de esta página {kind} está {state}.",fix:"Añade una canonical autorreferente correcta."},
  BREADCRUMB_SCHEMA:{title:"Schema Breadcrumb",message:"Los datos BreadcrumbList están {state}.",fix:"Añade datos BreadcrumbList válidos."},
  IMAGE:{title:"Imagen de tienda",message:"Una imagen relevante está {state}.",fix:"Añade una imagen de producto o categoría relevante."},
  PRODUCT_SCHEMA:{title:"Schema Product",message:"Los datos Product están {state}.",fix:"Añade datos Product válidos."},
  OFFER_SCHEMA:{title:"Schema Offer",message:"Los datos Offer o AggregateOffer están {state}.",fix:"Añade datos de oferta actualizados."},
  PRICE:{title:"Precio del producto",message:"Un precio visible está {state}.",fix:"Muestra un precio actual."},
  AVAILABILITY:{title:"Disponibilidad",message:"La disponibilidad está {state}.",fix:"Muestra la disponibilidad actual."}
 }
};

const state=(lang:CommerceLanguage,ok:boolean)=>{
 const words:Record<CommerceLanguage,[string,string]>={nl:["bevestigd","niet bevestigd"],en:["confirmed","not confirmed"],de:["bestätigt","nicht bestätigt"],fr:["confirmées","non confirmées"],it:["confermati","non confermati"],es:["confirmados","no confirmados"]};
 return ok?words[lang][0]:words[lang][1];
};
const kindLabel=(lang:CommerceLanguage,kind:string)=>{
 const labels:Record<CommerceLanguage,[string,string]>={nl:["product","categorie"],en:["product","category"],de:["Produkt","Kategorie"],fr:["produit","catégorie"],it:["prodotto","categoria"],es:["producto","categoría"]};
 return kind==="product"?labels[lang][0]:labels[lang][1];
};

export function buildCommerceFindings(audits:unknown,language:unknown="nl"):CommerceFinding[]{
 const lang=commerceLanguage(language);
 if(!Array.isArray(audits)) return [];
 const out:CommerceFinding[]=[];
 const add=(audit:CommerceAuditLike,key:string,ok:boolean,severity:"HIGH"|"MEDIUM"="MEDIUM")=>{
   const url=String(audit.url||""); const kind=String(audit.kind||"");
   const c=COPY[lang][key]; if(!url||!c) return;
   const suffix=key+"_MISSING";
   const message=c.message.replace("{kind}",kindLabel(lang,kind)).replace("{state}",state(lang,ok));
   out.push({category:"ecommerce",title:c.title,status:ok?"PASS":"FAIL",issue_status:ok?"PASS":"FAIL",message,fix:c.fix,
     issue_id:"COMMERCE_"+kind.toUpperCase()+"_"+suffix+"::"+url,severity,confidence:"high",
     evidence:{found:url,details:(ok?"Verified: ":"Affected page: ")+url}});
 };
 for(const raw of audits){
   const a=(raw||{}) as CommerceAuditLike; const kind=String(a.kind||"");
   if(a.error||!a.url||!["product","category"].includes(kind)) continue;
   add(a,"TITLE",!!a.title); add(a,"DESCRIPTION",!!a.description); add(a,"H1",!!a.h1);
   add(a,"CANONICAL",!!a.canonical); add(a,"BREADCRUMB_SCHEMA",!!a.breadcrumbSchema); add(a,"IMAGE",!!a.imageSignal);
   if(kind==="product"){
     add(a,"PRODUCT_SCHEMA",!!a.productSchema,"HIGH"); add(a,"OFFER_SCHEMA",!!a.offerSchema,"HIGH");
     add(a,"PRICE",!!a.priceSignal,"HIGH"); add(a,"AVAILABILITY",!!a.availabilitySignal,"HIGH");
   }
 }
 return out;
}
