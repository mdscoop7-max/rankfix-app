/**
 * RankFix QA: evidence-first organisation sector corroboration.
 * Homepage is checked before first-party representative pages. Customer market
 * pages, editorial topics, duplicate titles and generic checkout flows never vote.
 * No external requests or domain/brand lists. Unsupported/conflicted => abstain.
 */
/** @type {Array<[string,string,string,RegExp,RegExp,string[]]>} */
const TYPES = [
  // Mediated services: a platform connects customers to independent workers,
  // unlike a regular contractor taking appointments for their own employees.
  // QA 144: PT/ES/FR/IT/DE wording ("Contrate profissionais avaliados", "encontrará
  // profissionais … para realizar qualquer serviço") was not recognised.
  ["service_marketplace","service_marketplace","Platform voor vakdiensten",/(?<![\p{L}])(?:boek(?:en|t)?|book|hire|vind|find|regel(?:en|t)?|contrat[ae]\p{L}*|encontr[ae]\p{L}*|pe[çc]a or[çc]amentos?|solicit[ae]\p{L}*|trouve[zr]?|engage[zr]?|trova(?:re)?|assum[ei]|finden?|beauftrage[n]?)(?![\p{L}]).{0,100}(?<![\p{L}])(?:vakman|vakmannen|vakmensen|vakspecialist(?:en)?|dienstverlener(?:s)?|professionals?|profissionais|profissional|profesionales|profesional|professionnels?|artisans?|prestataires?|professionisti|artigiani|handwerker(?:in|innen)?|dienstleister|fachleute|handyman|handymen|tradespeople|klusjesman|experts?|especialistas?)(?![\p{L}])/iu,/(?<![\p{L}])(?:gescreende?|geselecteerde?|geverifieerde?|betrouwbare?|vetted|verified|screened|klussen?|boekingen?|afspraak|dienstverleners?|vakmensen|vakspecialisten?|professionals?|avaliad[oa]s?|avaliações|verificad[oa]s?|valoraciones|valorad[oa]s?|vérifiés?|avis|recensioni|verificati|bewertet|bewertungen|geprüfte?|or[çc]amentos?|presupuestos?|devis|preventivi|angebote|qualquer servi[çc]o|cualquier servicio|tout service|qualsiasi servizio)(?![\p{L}])/iu,[]],
  ["cybersecurity","cybersecurity","Cybersecurity & informatiebeveiliging",/\b(?:cyber[- ]?(?:defen[cs]e|resilience|protection)|cyber[- ]?security|cyberbeveiliging|informatiebeveiliging|information security|security operations cent(?:er|re)|incident response services?|managed security services?|cybersécurité)\b/i,/\b(?:threat detection|threat intelligence|ransomware|cyber attacks?|cyber threats?|attackers?|defen[cs]es|cyberincident(?:en)?|incident response|penetration test(?:ing)?|managed detection|endpoint protection|digital forensics|cybersecurity)\b/i,[]],
  ["waste_recycling","waste_recycling","Afvalverwerking & recycling",/\b(?:waste management|waste collection|waste services?|recycling company|recycling services?|recyclingbedrijf|afvalverwerking|afvalinzameling|afvalbeheer|afvaldienst\w*|bedrijfsafval|afval (?:laten )?(?:ophalen|inzamelen|verwerken)|resource recovery|recyclage|déchets|gestion des déchets|abfallentsorgung|abfallwirtschaft|entsorgung|kreislaufwirtschaft)\b/i,/\b(?:waste|afval|\w*afval|recycling|recyclage|materials recovery|resource recovery|circulair|circular|hergebruik|inzameling|ophalen|verwerken|sortering|grondstoffen|déchets|ressources|containers?)\b/i,[]],
  ["sports_organizations","sports_organizations","Sportbond & sportorganisatie",/\b(?:sports? (?:federation|governing body|association|organisation|organization)|sportbond|sportfederatie|sportorganisatie|voetbalbond|football association|olympic committee|olympisch comité|national governing body|fédération sportive|fußballverband)\b/i,/\b(?:sport|clubs?|teams?|competitions?|competities?|wedstrijden|leagues?|members?|leden|football|voetbal|athletes?|sporters?)\b/i,["sportsorganization"]],
  ["maritime_ports","maritime_ports","Havenbedrijf & maritieme infrastructuur",/\b(?:port authority|port of [a-zà-ÿ-]+|havenbedrijf|havenautoriteit|harbour authority|harbor authority|seaport|zeehaven|maritime port|port operator|port operations|terminal operator)\b/i,/\b(?:maritime|shipping|vessels?|ships?|containers?|terminals?|logistiek|logistics|harbour|harbor|haven|cargo|port infrastructure|zeevaart)\b/i,[]],
  ["airports","airports","Luchthaven & luchthavenexploitatie",/\b(?:airport|airports|luchthaven|aéroport|flughafen|aeroporto|aeropuerto|airport operator|airport authority)\b/i,/\b(?:departures?|arrivals?|vluchten?|flights?|passengers?|terminal(?:s)?|runway|destinations?|check[- ]in|aviation|luchtvaart|airlines?|gate(?:s)?)\b/i,["airport"]],
  ["agriculture_horticulture","agriculture_horticulture","Landbouw & tuinbouw",/\b(?:agriculture|agricultural cooperative|horticulture|horticultural|tuinbouw|landbouw|agrarische coöperatie|agrarisch collectief|floriculture|flower auction|bloemenveiling|farmers? cooperative|crop cultivation|teeltbedrijf)\b/i,/\b(?:growers?|telers?|teelt|coöperatie|cooperative|farms?|farmers?|boeren|gewassen|crops?|bloemen|flowers?|horticulture|landbouw|agrarisch)\b/i,[]],
  ["professional_services","legal","Juridische dienstverlening & advocatuur",/\b(?:law firm|legal counsel|legal services?|legal advice|legal advis[eo]rs?|lawyers|law practice|juridisch advies|avocats|abogados|avvocati|rechtsanwälte|advocatenkantoor|advocaten|advocaat|juridische dienstverlening|cabinet d.avocats|rechtsanwälte|rechtsanwalt|studio legale|firma de abogados|attorneys? at law)\b/i,/\b(?:legal|juridisch|recht|law|litigation|disputes?|advocacy|advocatuur|practice areas?|rechtsgebied(?:en)?|rechtsadvies|counsel|clients?|advocaten|rechtsanwalt)\b/i,["legalservice","attorney"]],
  ["nonprofit","charities_nonprofits","Goede doelen & hulporganisaties",/\b(?:charity|charitable organi[sz]ation|humanitarian organi[sz]ation|humanitaire organisatie|hulporganisatie|goede doelen?|non[- ]?profit|ngo|stichting|foundation|relief organi[sz]ation|aid organi[sz]ation)\b/i,/\b(?:humanitarian|hulpverlening|steun ons|doneren|donaties?|donate|donation|vrijwilligers?|volunteers?|good cause|missie|our mission|humanitaire hulp|emergency relief|charitable|non[- ]?profit)\b/i,["ngo"]],
  ["events_culture","museum_culture","Museum & cultuur",/\b(?:museum|museums|musée|museo|museen|science museum|art museum|national gallery|kunsthal)\b/i,/\b(?:collectie|collections?|exhibitions?|tentoonstelling(?:en)?|expositie(?:s)?|artworks?|kunstwerken|museum|visitor(?:s)?|bezoekers?|galerie|gallery|culturele)\b/i,["museum"]],
  ["professional_services","architecture_design","Architectuur & ontwerp",/\b(?:architectuurbureau|architectenbureau|architecture firm|architecture studio|architects? practice|architectural practice|architecture (?:and [a-z]+ )?practice|(?:studio|practice|firm|bureau) (?:for|of) (?:[a-z]+,? ){0,3}architecture|architects|architecten|architektenbüro|cabinet d.architecture|estudio de arquitectura)\b/i,/\b(?:building design|ontwerp|architectuur|architecture|projecten|projects|planning|urban design|gebouwen|built environment|interieur)\b/i,[]],
  // Local businesses (physical shops, salons, practices, hotels, restaurants) in
  // NL, EN, DE, FR, ES and IT. The NAME pattern is the trade/activity noun a
  // business uses for itself; product words (glasses, shampoo, rooms) are only
  // CONTEXT, so a webshop that sells those products never declares the trade.
  ["hospitality","restaurant","Restaurant & horeca",/(?<![\p{L}])(?:restaurant(?:s|e|es)?|ristorant[ei]|brasserie|bistro[t]?|trattoria|osteria|steakhouse|grillroom|lunchroom|pizzeri(?:a|e|as)|taberna|asador|marisquer[ií]a|gasthaus|gastst[äa]tte|wirtshaus|crêperie|creperie|uit eten|dineren)(?![\p{L}])|(?<![\p{L}])(?:eet|biljart)caf(?:é|e)(?![\p{L}])/iu,/(?<![\p{L}])(?:menu(?:'?s|kaart)?|menù|carta|carte|speisekarte|gerechten|lunch|diner|dinner|cena|pranzo|almuerzo|déjeuner|reserv\w*|réserv\w*|prenot\w*|tafel|table|tisch|mesa|tavolo|gastvrij\w*|eat[- ]in|bezorg\w*|afhalen|takeaway|dishes|plats|piatti|platos|tapas|pizza|cucina|cuisine|küche|cocina|biefstuk|chicken|domicilio|livraison|lieferung|ordina|bestel\w*|commande\w*)(?![\p{L}])/iu,["restaurant","foodestablishment","fastfoodrestaurant","barorcafe"]],
  ["hospitality","hotel","Hotel & accommodatie",/(?<![\p{L}])(?:hotel(?:s|es)?|hôtel(?:s|lerie)?|albergh?[oi]|hostal(?:es)?|boutique hotel|aparthotel|hotelketen|hotelgroep|hotel group|hotelkette)(?![\p{L}])/iu,/(?<![\p{L}])(?:kamers?|rooms?|suites?|overnacht\w*|stay|zimmer|übernacht\w*|chambres?|séjour|habitaci[oó]n(?:es)?|estancia|camer[ae]|soggiorno|ontbijt|breakfast|frühstück|petit[- ]déjeuner|desayuno|colazione|arrangement\w*|boek\w*|book\w*|buch\w*|réserv\w*|reserv\w*|prenot\w*|sterren|stars?|sterne|étoiles|estrellas|stelle)(?![\p{L}])/iu,["hotel","lodgingbusiness","resort","hostel","motel"]],
  ["health_wellness","optician","Opticien & oogzorg",/(?<![\p{L}])(?:opticien\w*|optiek(?:zaak|zaken)?|brillenwinkel\w*|brillenzaak|optician\w*|optometrist\w*|optometrie|(?:augen)?optiker\w*|augenoptik|magasins? d.optique|(?<!fibre )optique|(?<!fibra )[óo]ptic(?:a|as|o|os)|optometrista\w*|(?<!fibra )ottic[ao]|ottici|centro ottico|ótica|ótica)(?![\p{L}])/iu,/(?<![\p{L}])(?:brillen?|bril|zonnebrillen?|(?:contact)?lenzen|oogmeting|oogzorg|ogen|glasses|spectacles|eyewear|sunglasses|contact lenses|eye ?tests?|eye exam\w*|sight test|kontaktlinsen|sehtest|sonnenbrillen?|hörgerät\w*|hörtest|lunettes|lentilles|examen de vue|montures?|audition|audioproth\w*|gafas|lentillas|graduaci\w*|revisi[oó]n (?:visual|de la vista)|aud[ií]fonos|occhiali|lenti a contatto|lenti|esame della vista|controllo della vista|vista|apparecchi acustici)(?![\p{L}])/iu,["optician"]],
  ["beauty","hair_salon","Kapper & haarsalon",/(?<![\p{L}])(?:kapper\w*|kapsalon\w*|haarstudio\w*|barbier\w*|barbershops?|barbers?|hair ?dress\w*|hair ?salons?|hair ?stylists?|friseur\w*|frisör\w*|frisør\w*|coiffeur\w*|coiffeuse\w*|salons? de coiffure|coiffure|peluquer[ií]a\w*|peluquer[oa]s?|barber[ií]as?|parrucchier[ei]|barbieri|cabeleireir\w*|sal(?:ão|ões) de (?:cabeleireiro|beleza)|frisörsalong\w*)(?![\p{L}])/iu,/(?<![\p{L}])(?:knippen|kleuren|haar|haircuts?|colou?r|blow ?dry|hair|haarschnitt\w*|färben|strähnen|coupe|couleur|coiffage|brushing|corte|mechas|tinte|taglio|colore|piega|afspraak|termin\w*|rendez-vous|cita|prenota\w*|appointments?|book\w*|salons?|saloni|sal(?:ão|ões)|salones|beard|baard|bart|barba|capilar(?:es)?|cabelo|coloração|madeixas|penteados?|marca(?:r|ção)?(?: a tua| a sua)? visita|marcação)(?![\p{L}])/iu,["hairsalon"]],
  ["beauty","beauty_salon","Schoonheidssalon & beauty",/(?<![\p{L}])(?:schoonheidssalon\w*|beautysalon\w*|beauty ?salons?|nagelstudio\w*|nagelsalon\w*|nail ?salons?|nail ?studio\w*|day ?spa|kosmetikstudio\w*|kosmetikinstitut\w*|institut de beauté|instituts de beauté|centros? de (?:estética|belleza)|salón de belleza|centr[oi] esteti(?:co|ci)|istituto di bellezza|estetista|esteticista|schoonheidsspecialist\w*)(?![\p{L}])/iu,/(?<![\p{L}])(?:behandeling\w*|treatments?|manicure|pedicure|facials?|gezicht\w*|huid|skin|soins?|visage|tratamientos?|trattament[io]|behandlung\w*|kosmetik|massage\w*|wax\w*|épilation|depilaci[oó]n|ceretta|afspraak|termin\w*|rendez-vous|cita|prenota\w*|appointments?|book\w*)(?![\p{L}])/iu,["beautysalon","dayspa","nailsalon"]],
  ["food_local_retail","bakery","Bakkerij & banketbakker",/(?<![\p{L}])(?:bakkerij\w*|bakker|banketbakker\w*|bakery|bakeries|patisserie|pâtisserie|boulangerie\w*|bäckerei\w*|konditorei\w*|panader[ií]a\w*|pasteler[ií]a\w*|panifici[oi]|pasticceri[ae])(?![\p{L}])/iu,/(?<![\p{L}])(?:brood|broden|gebak|taart\w*|bread|cakes?|pastr(?:y|ies)|croissants?|pain|gâteaux|brot|brötchen|kuchen|pan|pasteles|pane|dolci|torte|vers|fresh|frais|frisch|fresco)(?![\p{L}])/iu,["bakery"]],
  ["health_wellness","dentist","Tandarts & mondzorg",/(?<![\p{L}])(?:tandarts\w*|mondzorg\w*|dentists?|dental (?:practice|clinic|surgery|care)|zahnarzt\w*|zahnärzt\w*|zahnklinik\w*|zahnarztpraxis|dentiste\w*|cabinet dentaire|centre dentaire|dentista\w*|cl[ií]nica dental|cl[ií]nicas dentales|studio dentistico|studi dentistici|odontoiatri\w*)(?![\p{L}])/iu,/(?<![\p{L}])(?:implant\w*|orthodon\w*|ortodon\w*|kieferorthop\w*|prophylax\w*|tandheelk\w*|gebit|tanden|teeth|zähne|zahnersatz|dents|soins dentaires|dientes|blanqueamiento|denti|igiene|afspraak|termin\w*|rendez-vous|cita|prenota\w*|appointments?|visita|patiënt\w*|patients?|pacientes?|pazient\w*)(?![\p{L}])/iu,["dentist"]],
  ["health_wellness","physiotherapy","Fysiotherapie & paramedische zorg",/(?<![\p{L}])(?:fysiotherap\w*|physiotherap\w*|kinésithérap\w*|kinesitherap\w*|kiné|fisioterap\w*|osteopa\w*|ostéopath\w*|chiropract\w*|chiroprakt\w*|quiropr[aá]ctic\w*|ergotherap\w*|podotherap\w*|logopäd\w*|logoped\w*)(?![\p{L}])/iu,/(?<![\p{L}])(?:behandeling\w*|therap\w*|rehabilit\w*|revalidatie|rééducation|rehabilitaci[oó]n|riabilitazione|massage\w*|masaje\w*|massaggi\w*|pijn|pain|douleur|dolor|dolore|schmerz\w*|sport\w*|afspraak|termin\w*|rendez-vous|cita|prenota\w*|appointments?|praxis|praktijk|cabinet|cl[ií]nica|studio)(?![\p{L}])/iu,["physiotherapy"]],
  ["automotive","car_repair","Garage & autoservice",/(?<![\p{L}])(?:autobedrijf|autogarage|garagebedrijf|autowerkplaats|kfz-werkstatt|kfz-meisterbetrieb|autowerkstatt|autoreparatur|garage automobile|garage auto|garagiste|taller(?:es)? mec[aá]nicos?|taller de coches|autofficina|officina (?:meccanica|auto)|gommista|car repairs?|auto repairs?|car garage|mot centre|car service centre)(?![\p{L}])/iu,/(?<![\p{L}])(?:apk|onderhoud|reparatie|banden|inspektion|reparatur|reifen\w*|hu|tüv|ölwechsel|entretien|réparation|pneus|freins|vidange|contrôle technique|mantenimiento|reparaci[oó]n|neum[aá]ticos|frenos|itv|tagliando|revisione|pneumatici|riparazion\w*|servicing|repairs?|tyres?|tires?|mot|brakes|termin\w*|rendez-vous|cita|prenota\w*|afspraak|book\w*)(?![\p{L}])/iu,["autorepair"]],
  ["real_estate","real_estate","Makelaardij & vastgoed",/(?<![\p{L}])(?:makelaar\w*|makelaardij|real estate agen\w*|estate agents?|letting agents?|immobilienmakler\w*|immobilienbüro|maklerbüro|agences? immobili[eè]res?|agent immobilier|inmobiliarias?|agencia inmobiliaria|agenzi[ae] immobiliar[ei]|immobiliare)(?![\p{L}])/iu,/(?<![\p{L}])(?:te koop|te huur|woning\w*|huizen|for sale|to let|for rent|propert\w*|zu verkaufen|zu vermieten|wohnung\w*|häuser|immobilien|à vendre|à louer|appartements?|maisons?|achat|vente|location|en venta|en alquiler|pisos?|casas?|in vendita|in affitto|appartament\w*|case|valutazione|estimation|tasaci[oó]n|waardebepaling|bewertung|taxatie)(?![\p{L}])/iu,["realestateagent"]],
  ["health_wellness","pharmacy","Apotheek",/(?<![\p{L}])(?:apothe(?:ek|ken|ke)|pharmac(?:y|ies)|pharmacie\w*|farmaci[ae]|droguer[ií]a)(?![\p{L}])/iu,/(?<![\p{L}])(?:medicijn\w*|geneesmiddel\w*|recept\w*|medicines?|prescriptions?|arzneimittel|rezept\w*|médicaments?|ordonnance\w*|medicamentos?|receta\w*|medicin[ae]li|ricett\w*|farmacist\w*|apotheker\w*|pharmacist\w*|pharmacien\w*|gezondheid|health|santé|gesundheit|salud|salute)(?![\p{L}])/iu,["pharmacy"]],
  // Supermarket / grocery retail chains (QA 144: IT/ES/SE chains were "unknown").
  // The trade noun names the organisation's own shops; grocery context words
  // (offers, recipes, groceries, stores) confirm it. "Supermarket software" or
  // "for supermarkets" is an audience and never counts (audienceUse).
  ["ecommerce","supermarket","Supermarkt & levensmiddelenretail",/(?<![\p{L}])(?:supermarkt(?:en|keten)?|supermarkets?|supermarché[s]?|hypermarché[s]?|supermercat[oi]|ipermercat[oi]|supermercados?|hipermercados?|supermärkte?|lebensmittelmarkt|matbutik(?:er|en)?|livsmedelsbutik(?:er)?|dagligvarebutik(?:ker)?|supermarked(?:er)?|ruokakaup\p{L}*|grocery stores?|grocers?|kruideniers?)(?![\p{L}])/iu,/(?<![\p{L}])(?:boodschappen|aanbiedingen|bonus|recepten|groceries|grocery|offers|deals|recipes|courses|promotions?|recettes|promozion[ie]|offert[ae]|ricette|spesa|ofertas?|recetas|compra|alimentaci[oó]n|angebote|rezepte|lebensmittel|erbjudanden|recept|dagligvaror|handla|mat|tilbud|opskrifter|winkels?|filialen|stores?|magasins?|negozi|tiendas?|butiker|märkte|frescos?|fresh|vers|frais|freschi)(?![\p{L}])/iu,["grocerystore"]],
  ["automotive","car_rental","Autoverhuur",/\b(?:car rental|car hire|rent[- ]a[- ]car|rental cars?|van rental|autoverhuur|auto huren|mietwagen|autovermietung|location de voitures?|noleggio auto|alquiler de coches|aluguel de carros)\b/i,/\b(?:rental|rent|hire|book(?:ing)?|reserv\w*|locations?|vehicles?|cars?|vans?|trucks?|huren|airport|rates)\b/i,["autorental"]],
  ["health_wellness","veterinary","Dierenarts & veterinaire zorg",/\b(?:dierenarts|dierenkliniek|dierenziekenhuis|veterinary clinic|veterinary hospital|veterinary care|animal hospital|tierarzt|tierklinik|clinique vétérinaire)\b/i,/\b(?:dieren|huisdieren|pets?|animals?|veterinary|veterinaire|dierenarts|behandeling|treatment|zorg|care|tierarzt|vétérinaire)\b/i,["veterinarycare"]],
];
/** Local trades: businesses that serve customers in a shop, salon, practice or venue. */
export const LOCAL_TRADE_KEYS=new Set(["optician","pharmacy","hair_salon","beauty_salon","hotel","restaurant","bakery","dentist","physiotherapy","car_repair"]);
const SELF_DECLARATION=/\b(?:we (?:are|provide|offer|deliver)|(?:is|are) (?:an?|the|one of)|wij zijn|we zijn|wij bieden|we bieden|is een|zijn een|is (?:het|de|dé|hét)|nous sommes|est (?:un|une|le|la)|wir sind|ist (?:ein|eine|der|die)|somos|es (?:un|una|el|la)|siamo|è (?:un|una|il|la))\b/i;
/** @param {string} text @param {RegExp} name @param {string} [key] */
function audienceUse(text,name,key){
  const m=new RegExp(name.source,name.flags.replace("g","")).exec(text);
  if(!m)return false;
  // "... for restaurants" (audience) or "restaurant software" (a product for that market).
  return /\b(?:for|voor|für|pour|para|per)\s+(?:[\p{L}-]+\s+){0,2}$/iu.test(text.slice(Math.max(0,m.index-40),m.index))
    // Cybersecurity software IS the cybersecurity industry; for every other
    // family a product named after the market is made for that market.
    || (key!=="cybersecurity" && /^\s*(?:software|platforms?|apps?|tools?|systems?|solutions?|pos|crm|pms|kassa\w*|booking|reservation|management|channel manager|equipment|apparatuur|benodigdheden|supplies|groothandel|wholesale|marketing|websites?|furniture|meubilair|inrichting|textiel|linen|vergelijk\w*|comparison)\b/i.test(text.slice(m.index+m[0].length,m.index+m[0].length+30)));
}
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
    // The description is the organisation's own one-sentence self-description
    // ("We provide ... legal advice", "X is an architecture practice"): naming
    // the activity there is a declaration, not a passing topic word.
    const selfDeclared=n.includes(1)&&SELF_DECLARATION.test(fields[1])&&!audienceUse(fields[1],name,key);
    // Explicitly mediated booking is an independent self-description, even
    // when it appears on an About page with a generic title.
    const mediatedBookingDeclaration = key==="service_marketplace" && n.includes(1)
      && /\bvia\s+[\w-]+\s+boek(?:en|t)\s+klanten\b/i.test(fields[1])
      && /\bgescreend(?:e)?\b/i.test(fields[1]);
    const independent=n.some(i=>c.some(j=>i!==j))||n.length>=2||selfDeclared||mediatedBookingDeclaration;
    if(!independent && !(typed && (n.length||c.length)))continue;
    const own=fields.join(" ");
    if(key==="agriculture_horticulture" && /\b(?:agricultural equipment|farm machinery|tractors?|landbouwmachines?|software for farmers)\b/i.test(own))continue;
    if(key==="architecture_design" && /\b(?:software|cloud|system|enterprise|solutions?|data|it|security) architect(?:ure|s)?\b/i.test(own))continue;
    if(key==="legal" && /\b(?:legal software|legal tech|software for (?:lawyers|law firms)|legal automation platform)\b/i.test(own))continue;
    // Finding PROFESSIONALS for employers is recruitment, not a service marketplace.
    if(key==="service_marketplace" && /(?<![\p{L}])(?:recrutamento|recruitment|recruiting|reclutamiento|recrutement|reclutamento|personalvermittlung|werving|uitzend\p{L}*|staffing|headhunt\p{L}*|vacatur\p{L}*|vacancies|vagas? de emprego|ofertas? de empleo|offres? d.emploi|stellenangebote?|candidat[eo]s?|kandidat\p{L}*|talent acquisition)(?![\p{L}])/iu.test(own))continue;
    // A name used for a customer group ("software for law firms", "insurance for
    // architects") describes the audience, never the organisation itself.
    if(n.length&&n.every(i=>audienceUse(fields[i],name,key)))continue;
    if(key==="museum_culture" && /\b(?:museum shop|museum store|museum webshop|museum merchandise)\b/i.test(fields[0]))continue;
    if(key==="airports" && /\b(?:airport parking|airport transfers?|airport taxis?|airport shuttle)\b/i.test(fields[0]) && !types.some(t=>schemas.has(t)))continue;
    candidates.push({sector,key,label,score:n.length*3+(independent?4:0)+(typed?4:0)});
  }
  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length)return null;
  if(candidates[1]&&candidates[0].score<=candidates[1].score+1){
    // QA 144: "hospitality group … hotels and resorts … bars & restaurants" names two
    // activities of ONE sector. The tied candidates agree on the sector: decide the
    // sector, not a subtype. Different sectors still abstain.
    const tied=candidates.filter(c=>c.score>=candidates[0].score-1);
    const sameSector=tied.every(c=>c.sector===tied[0].sector);
    if(!sameSector)return null;
    const SECTOR_LABEL={hospitality:"Horeca & hospitality",health_wellness:"Zorg & gezondheid",beauty:"Beauty & verzorging",automotive:"Automotive",professional_services:"Zakelijke dienstverlening"};
    return {sector:tied[0].sector,key:tied[0].sector,label:SECTOR_LABEL[tied[0].sector]||tied[0].label,score:tied[0].score,evidence:[`Eigen organisatieactiviteit binnen één sector (${tied.map(c=>c.label).join(" + ")}); subtype niet eenduidig`]};
  }
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
    const ownWords=[p.title,p.description,...(p.identityHeadings||[])].map(tidy).join(" ");
    const mediation=/(?:\b(?:gescreend(?:e)?|geselecteerd(?:e)?|geverifieerd(?:e)?|vetted|verified|screened)\b.{0,80}\b(?:vakman|vakmannen|vakmensen|vakspecialist(?:en)?|dienstverlener(?:s)?|professionals?|handyman|handymen|tradespeople|experts?))|(?:\b(?:wij|we|ons platform|our platform)\b.{0,80}\b(?:koppelen|match(?:en)?|verbind(?:en)?|connect|match)\b)/i.test(ownWords);
    const vote={...d,url:url.toString(),mediation};votes.push(vote);
    if(path===rootPath)homepageVote=vote;
  }
  const byKey=new Map();
  // A hotel package, restaurant or shop page on an airport, museum or hotel site
  // is a side offer of that organisation: when the homepage declares its own
  // activity, sub-page votes for another LOCAL trade do not contradict it.
  for(const v of votes){
    if(homepageVote&&v!==homepageVote&&v.key!==homepageVote.key&&LOCAL_TRADE_KEYS.has(v.key))continue;const a=byKey.get(v.key)||[];a.push(v);byKey.set(v.key,a);}
  const ranked=[...byKey.entries()].map(([key,pages])=>({key,pages})).sort((a,b)=>b.pages.length-a.pages.length);
  const top=ranked[0],second=ranked[1];
  const enough=Boolean(top&&top.pages.length>=2&&(!second||(top.pages.length>=3&&top.pages.length>=3*second.pages.length)));
  const conflictingHome=Boolean(homepageVote&&top&&homepageVote.key!==top.key);
  // The homepage TITLE naming the activity ("... recyclage des déchets") anchors two
  // agreeing own pages; a homepage without any vote still needs three.
  const titleNames=(key)=>{const t=TYPES.find(x=>x[1]===key);return Boolean(t&&homepage&&t[3].test(tidy(homepage.title)));};
  const homepageAnchored=Boolean(top&&(homepageVote?.key===top.key||(!homepageVote&&top.pages.length>=3)||(!homepageVote&&top.pages.length>=2&&titleNames(top.key))));
  // Two booking pages belonging to one contractor are not a marketplace.
  const mediationConfirmed=Boolean(top && (top.key!=="service_marketplace" || top.pages.some(p=>p.mediation)));
  const decision=enough&&homepageAnchored&&!conflictingHome&&mediationConfirmed&&top?{
    sector:top.pages[0].sector,key:top.key,label:top.pages[0].label,
    confidence:"medium",confidenceScore:homepageVote?Math.min(90,80+top.pages.length*4):76,
    evidence:top.pages.slice(0,4).map(p=>p.url+": "+p.evidence.join("; ")),
  }:null;
  return {decision,reason:conflictingHome?"homepage_conflict":!top?"no_evidence":!enough?"insufficient_or_conflicting_pages":!homepageAnchored?"homepage_not_corroborated":"corroborated_homepage_and_pages",homepageIdentity:homepageVote?.key||null,supportingPages:top?.pages.length||0,candidates:ranked.map(r=>({key:r.key,count:r.pages.length,urls:r.pages.map(p=>p.url)}))};
}

// QA-144 (item 5): a generic decision within the right sector ("professional
// services", "events & culture") is refined to the specific subtype when the
// organisation's own title or description names it. Subtype only: the main
// sector and its confidence never change here.
/** @type {Array<[string,string,string,RegExp,RegExp|null]>} */
const SUBTYPE_HINTS = [
  ["professional_services","legal","Juridische dienstverlening & advocatuur",/\b(?:law firm|lawyers?|legal (?:advice|services?|counsel)|advocat\w*|juridisch\w*|rechtsanw\w*|avocats?|abogados?|avvocat\w*)\b/i,/\b(?:legal (?:software|tech)|software for (?:lawyers|law firms))\b/i],
  ["professional_services","architecture_design","Architectuur & ontwerp",/\b(?:architect(?:ure|s|en|uur|ural|urbureau|enbureau)?|architektur\w*|arquitectura)\b/i,/\b(?:software|cloud|system|enterprise|solutions?|data|it|security) architect\w*/i],
  ["events_culture","museum_culture","Museum & cultuur",/\b(?:museum|museums|musée|museo|museen|muzeum)\b|museum\b/i,/\bmuseum (?:shop|store|webshop)\b/i],
  ["health_wellness","veterinary","Dierenarts & veterinaire zorg",/\b(?:dierenarts\w*|dierenkliniek\w*|dierenziekenhuis\w*|veterinar\w*|vétérinaire|tierarzt\w*|tierklinik\w*|animal hospital|vet clinic)\b/i,null],
  ["nonprofit","charities_nonprofits","Goede doelen & hulporganisaties",/\b(?:charit\w*|goede? doel\w*|humanitar\w*|humanitair\w*|hulporganisatie\w*|ngo|non[- ]?profit)\b/i,null],
  // Local businesses: the same multilingual trade nouns as the declaration table.
  ...[...LOCAL_TRADE_KEYS].map((key)=>{
    const t=TYPES.find(x=>x[1]===key);
    return /** @type {[string,string,string,RegExp,RegExp|null]} */ ([t[0],t[1],t[2],t[3],null]);
  }),
];
/**
 * @param {{sector:string,key?:string|null}} profile
 * @param {{title?:string|null,description?:string|null}} page
 * @returns {{key:string,label:string}|null}
 */
export function refineSubtype(profile,page){
  if(!profile||!profile.sector||(profile.key&&profile.key!==profile.sector))return null;
  const own=[tidy(page.title),tidy(page.description)].join(" | ");
  for(const [sector,key,label,hint,exclude] of SUBTYPE_HINTS){
    if(sector!==profile.sector||!hint.test(own))continue;
    if(exclude&&exclude.test(own))continue;
    // "Software for hotels" names a market, not the organisation's own trade.
    if([tidy(page.title),tidy(page.description)].every(f=>!hint.test(f)||audienceUse(f,hint,key)))continue;
    return {key,label};
  }
  return null;
}
