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
  ["service_marketplace","service_marketplace","Platform voor vakdiensten",/(?<![\p{L}])(?:boek(?:en|t)?|book|hire|vind|find|regel(?:en|t)?|contrat[ae]\p{L}*|encontr[ae]\p{L}*|pe[çc]a or[çc]amentos?|solicit[ae]\p{L}*|trouve[zr]?|engage[zr]?|trova(?:re)?|assum[ei]|finden?|beauftrage[n]?|encuentr[ae]\p{L}*|pide|pida|pedir|f(?:å|aa)|innhent\p{L}*|indhent\p{L}*|hitta|anlita|f(?:å|a)r|finne|finn|finde|finna|bli kontaktet av|bliv kontaktet af|bli kontaktad av|legg ut jobben|læg (?:din )?opgave(?:n)? (?:ud|op)|lägg upp (?:ditt )?uppdrag|saat?|löydä|pyydä|kilpailuta|znajdź|zleć|porównaj)(?![\p{L}]).{0,100}(?<![\p{L}])(?:vakman|vakmannen|vakmensen|vakspecialist(?:en)?|dienstverlener(?:s)?|professionals?|profissionais|profissional|profesionales|profesional|professionnels?|artisans?|prestataires?|professionisti|artigiani|handwerker(?:in|innen)?|dienstleister|fachleute|handyman|handymen|tradespeople|klusjesman|experts?|especialistas?|h(?:å|aa)ndverker\p{L}*|h(?:å|aa)ndværker\p{L}*|hantverkar\p{L}*|fagfolk|fagm(?:a|æ)nd|fagperson\p{L}*|ammattilai\p{L}*|remonttimie\p{L}*|fachow\p{L}*|wykonawc\p{L}*|specjalist\p{L}*|reformistas?|operários?)(?![\p{L}])/iu,/(?<![\p{L}])(?:gescreende?|geselecteerde?|geverifieerde?|betrouwbare?|vetted|verified|screened|klussen?|boekingen?|afspraak|dienstverleners?|vakmensen|vakspecialisten?|professionals?|avaliad[oa]s?|avaliações|verificad[oa]s?|valoraciones|valorad[oa]s?|vérifiés?|avis|recensioni|verificati|bewertet|bewertungen|geprüfte?|or[çc]amentos?|presupuestos?|devis|preventivi|angebote|qualquer servi[çc]o|cualquier servicio|tout service|qualsiasi servizio|tilbud|offert(?:er|erna)?|tarjou\p{L}*|ofert\p{L}*|wycen\p{L}*|gratis|gratuit[oa]?s?|kostenlos|ilmai\p{L}*|darmow\p{L}*|anmeldelser|omdømme|jobben|oppdrag\p{L}*|opgave\p{L}*|uppdrag\p{L}*|evaluering\p{L}*|kompetanse|kontaktet|arvostel\p{L}*|opini\p{L}*|reseñas)(?![\p{L}])/iu,[]],
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
  ["real_estate","real_estate","Makelaardij & vastgoed",/(?<![\p{L}])(?:makelaar\w*|makelaardij|real estate agen\w*|estate agents?|letting agents?|immobilienmakler\w*|immobilienbüro|maklerbüro|agences? immobili[eè]res?|agent immobilier|inmobiliarias?|agencia inmobiliaria|agenzi[ae] immobiliar[ei]|immobiliare|ejendomsmægler\p{L}*|ejendomsmæglerfirma\p{L}*|fastighetsmäklar\p{L}*|fastighetsbyrå\p{L}*|mäklarfirma\p{L}*|mäklarbyrå\p{L}*|eiendomsmegl\p{L}*|meglerhus\p{L}*|meglerfirma\p{L}*|fasteignasal\p{L}*|kiinteistönvälit\p{L}*|kiinteistövälit\p{L}*|välitystoimisto\p{L}*|kinnisvarabüroo\p{L}*|kinnisvaramaakler\p{L}*|biur(?:o|a|em|ze) nieruchomości|agencj\p{L}* nieruchomości|pośredni\p{L}* (?:w obrocie )?nieruchomości\p{L}*|imobiliári(?:a|as)|mediação imobiliária|mediadora imobiliária|agência imobiliária|consultor(?:es|a)? imobiliári\p{L}*|realitn\p{L}* kancelář\p{L}*|realitn\p{L}* kancelári\p{L}*|realitní makléř\p{L}*|realitný maklér\p{L}*|ingatlaniroda\p{L}*|ingatlanügynök\p{L}*|agenți\p{L}* imobiliar\p{L}*|agenție imobiliară|μεσιτικ\p{L}* γραφεί\p{L}*|κτηματομεσίτ\p{L}*|agencij\p{L}* za nekretnine|nepremičninsk\p{L}* agencij\p{L}*|annunci (?:di )?(?:case|immobili|appartamenti)|annunci immobiliari|annonces immobilières|anuncios (?:de )?(?:pisos|casas|inmuebles|viviendas)|anúncios (?:de )?(?:imóveis|casas)|immobilienangebote|immobilienanzeigen|woningaanbod|property listings|bostadsannonser|boligannonser|asuntoilmoitu\p{L}*|ogłoszenia nieruchomości|inzerce nemovitostí|ingatlanhirdetés\p{L}*|anunțuri imobiliare)(?![\p{L}])/iu,/(?<![\p{L}])(?:til salg|til salgs|till salu|myynnissä|myytävät?|à venda|para venda|para arrendar|arrendar|na sprzedaż|na wynajem|sprzedaż|wynajem|mieszkani\p{L}*|dom(?:y|ów)|nemovitost\p{L}*|ingatlan\p{L}*|eladó|kiadó|de vânzare|de închiriat|ακίνητ\p{L}*|nekretnin\p{L}*|nepremičnin\p{L}*|bolig(?:er|en)?|bostad|bostäder|boende|asun(?:to|not|toja|tosi)|kiinteistö\p{L}*|imóve(?:is|l)|apartamentos?|moradias?|vender (?:a sua |o seu )?(?:casa|imóvel)|sælg\p{L}*|sälj\p{L}*|selg\p{L}*|myy(?:dä|nti)?|verdivurdering|vurdering|värdering|arvio|avaliação|wycen\p{L}*|te koop|te huur|woning\w*|huizen|for sale|to let|for rent|propert\w*|zu verkaufen|zu vermieten|wohnung\w*|häuser|immobilien|à vendre|à louer|appartements?|maisons?|achat|vente|location|en venta|en alquiler|pisos?|casas?|in vendita|in affitto|appartament\w*|case|valutazione|estimation|tasaci[oó]n|waardebepaling|bewertung|taxatie)(?![\p{L}])/iu,["realestateagent"]],
  ["health_wellness","pharmacy","Apotheek",/(?<![\p{L}])(?:apothe(?:ek|ken|ke)|pharmac(?:y|ies)|pharmacie\w*|farmaci[ae]|droguer[ií]a)(?![\p{L}])/iu,/(?<![\p{L}])(?:medicijn\w*|geneesmiddel\w*|recept\w*|medicines?|prescriptions?|arzneimittel|rezept\w*|médicaments?|ordonnance\w*|medicamentos?|receta\w*|medicin[ae]li|ricett\w*|farmacist\w*|apotheker\w*|pharmacist\w*|pharmacien\w*|gezondheid|health|santé|gesundheit|salud|salute)(?![\p{L}])/iu,["pharmacy"]],
  // Supermarket / grocery retail chains (QA 144: IT/ES/SE chains were "unknown").
  // The trade noun names the organisation's own shops; grocery context words
  // (offers, recipes, groceries, stores) confirm it. "Supermarket software" or
  // "for supermarkets" is an audience and never counts (audienceUse).
  ["ecommerce","supermarket","Supermarkt & levensmiddelenretail",/(?<![\p{L}])(?:supermarkt(?:en|keten)?|supermarkets?|supermarché[s]?|hypermarché[s]?|supermercat[oi]|ipermercat[oi]|supermercados?|hipermercados?|supermärkte?|lebensmittelmarkt|matbutik(?:er|en)?|livsmedelsbutik(?:er)?|dagligvarebutik(?:ker)?|supermarked(?:er)?|ruokakaup\p{L}*|grocery stores?|grocers?|kruideniers?)(?![\p{L}])/iu,/(?<![\p{L}])(?:boodschappen|aanbiedingen|bonus|recepten|groceries|grocery|offers|deals|recipes|courses|promotions?|recettes|promozion[ie]|offert[ae]|ricette|spesa|ofertas?|recetas|compra|alimentaci[oó]n|angebote|rezepte|lebensmittel|erbjudanden|recept|dagligvaror|handla|mat|tilbud|opskrifter|winkels?|filialen|stores?|magasins?|negozi|tiendas?|butiker|märkte|frescos?|fresh|vers|frais|freschi)(?![\p{L}])/iu,["grocerystore"]],
  // DIY / home-improvement store chains (QA 144: "De grootste doe-het-zelf winkels
  // van België" was unknown when the recovered homepage showed no cart). Existing
  // retail sector and key; only the declaration is recognised. "Software voor
  // bouwmarkten" is an audience (audienceUse) and never counts.
  ["ecommerce","ecommerce","Retail · bouwmarkt / doe-het-zelf",/(?<![\p{L}])(?:doe-het-zelf[- ]?(?:winkels?|zaak|zaken|markt\p{L}*|keten)|doe het zelf[- ](?:winkels?|zaak|markt\p{L}*)|bouwmarkt\p{L}*|klusmarkt\p{L}*|diy[- ](?:stores?|shops?|retailer)|home improvement (?:stores?|retailer)|hardware stores?|magasins? de bricolage|grandes? surfaces? de bricolage|baum[äa]rkte?|heimwerkerm[äa]rkte?|negozi(?:o)? (?:di |del )?fai[- ]da[- ]te|tiendas? de bricolaje)(?![\p{L}])/iu,/(?<![\p{L}])(?:gereedschap|bouwmaterialen|klus\p{L}*|tuin|verf|sanitair|outillage|matériaux|jardin|peinture|bricolage|werkzeug|baustoffe|garten|farben|utensili|giardino|vernici|herramientas|jardín|pinturas|tools|garden|paint|winkels?|magasins?|filialen|märkte|negozi|tiendas|stores?)(?![\p{L}])/iu,["hardwarestore","homegoodsstore"]],
  // Car body / collision repair (schadeherstel, carrosserie, Karosserie, carrozzeria,
  // chapa y pintura, karosseri…): the same automotive repair trade (key car_repair).
  // Field case (25 Oct): a Dutch body-repair chain ("een van de grootste …
  // schadeherstelketens van Nederland", pages on autoschade, ruitschade, uitdeuken)
  // was "unknown". Bare "schadeherstel" also means property damage repair, so a
  // vehicle word must appear in the own fields (checked in detectDeclaredIndustry).
  ["automotive","car_repair","Autoschadeherstel & carrosserie",/(?<![\p{L}])(?:autoschadeherstel\p{L}*|autoschade(?:bedrijf|specialist|herstel)\p{L}*|autoherstel\p{L}*|schadeherstel\p{L}*|schadebedrijf\p{L}*|autospuiterij\p{L}*|spuiterij\p{L}*|carrosseriebedrijf\p{L}*|carrosserie(?:herstel|werkplaats|bouw)?|carrossier\p{L}*|autoruitherstel\p{L}*|autoruitschade\p{L}*|karosserie(?:bau|werkstatt|fachbetrieb|instandsetzung|reparatur)?\p{L}*|unfallinstandsetzung|unfallreparatur|unfallschaden(?:reparatur|instandsetzung)|autolackiererei\p{L}*|lackiererei\p{L}*|body ?shops?|collision (?:repair|center|centre)\p{L}*|accident repair\p{L}*|crash repair\p{L}*|smart repair|réparation de carrosserie|atelier de carrosserie|carrosseries?|carrozzeri[ae]|carrozzier[ei]|riparazione carrozzeria|taller(?:es)? de chapa(?: y pintura)?|chapa y pintura|oficinas? de (?:chapa|colisão|bate-chapa)|bate-chapas?|reparação de colisão|karosseri(?:verksted|værksted|verkstad)?\p{L}*|skadeverkstad\p{L}*|bilskade\p{L}*|lakkereringsverksted|korjaamo\p{L}*|kolarikorjaa\p{L}*|korikorjaa\p{L}*|blacharstw\p{L}*|blacharsko-lakiernicz\p{L}*|lakiernictw\p{L}*|autoklempíř\p{L}*|autolakovn\p{L}*|karosszéri\p{L}*|tinichigerie\p{L}*|vopsitorie\p{L}*)(?![\p{L}])/iu,/(?<![\p{L}])(?:autoschade|schade|ruitschade|lakschade|hagelschade|uitdeuken|spuiten|herstel\p{L}*|vestiging\p{L}*|verzeker\p{L}*|garantie|unfall\p{L}*|schaden|lack\p{L}*|delle\p{L}*|hagel\p{L}*|versicherung\p{L}*|dégâts|sinistre|pare-brise|grêle|peinture|débosselage|danni|grandine|parabrezza|verniciatura|siniestro\p{L}*|granizo|pintura|lunas?|vidros?|colisão|skade\p{L}*|lakk\p{L}*|vahin\p{L}*|szkod\p{L}*|lakier\p{L}*|repairs?|dents?|paint\p{L}*|windscreens?|insurance|accident\p{L}*|reparatie|reparatur|réparation|riparazion\p{L}*|reparaci[oó]n|reparação)(?![\p{L}])/iu,["autobodyshop","autorepair"]],
  ["automotive","car_rental","Autoverhuur",/\b(?:car rental|car hire|rent[- ]a[- ]car|rental cars?|van rental|autoverhuur|auto huren|mietwagen|autovermietung|location de voitures?|noleggio auto|alquiler de coches|aluguel de carros)\b/i,/\b(?:rental|rent|hire|book(?:ing)?|reserv\w*|locations?|vehicles?|cars?|vans?|trucks?|huren|airport|rates)\b/i,["autorental"]],
  ["health_wellness","veterinary","Dierenarts & veterinaire zorg",/\b(?:dierenarts|dierenkliniek|dierenziekenhuis|veterinary clinic|veterinary hospital|veterinary care|animal hospital|tierarzt|tierklinik|clinique vétérinaire)\b/i,/\b(?:dieren|huisdieren|pets?|animals?|veterinary|veterinaire|dierenarts|behandeling|treatment|zorg|care|tierarzt|vétérinaire)\b/i,["veterinarycare"]],
  // QA international-28 (25 Oct): organisations in existing sectors whose own
  // self-description was not recognised in their language. Sector and key stay
  // inside the existing families; the same independence rule applies (name in one
  // own field + context in another, or a self-description sentence).
  // Mortgage advice / brokerage (financial services). "For mortgage advisers" is
  // an audience (audienceUse).
  ["financial_services","financial_mortgage","Hypotheekadvies & financiering",/(?<![\p{L}])(?:hypotheekadvi\p{L}*|hypotheekbemiddel\p{L}*|hypotheekverstrekk\p{L}*|hypotheken|mortgage (?:advi[sc]\p{L}*|brokers?|broking|lenders?)|mortgages|baufinanzierungsberat\p{L}*|baufinanzierungsvermittl\p{L}*|baufinanzierung|immobilienfinanzierung|hypothekenvermittl\p{L}*|hypothekarberat\p{L}*|courtiers? en (?:prêts?|crédits?) immobiliers?|courtage en crédit immobilier|intermediari\p{L}* (?:del credito|creditizi\p{L}*)|mediatore creditizio|consulenza mutui|broker hipotecari[oa]|intermediari[oa]s? de crédito|intermediação de crédito|intermediário de crédito|crédito (?:à )?habitação|boliglånsrådgiv\p{L}*|realkreditrådgiv\p{L}*|boliglån|realkredit\p{L}*|bolånerådgiv\p{L}*|bolån|asuntolaina\p{L}*|doradc\p{L}* kredytow\p{L}*|pośredni\p{L}* kredytow\p{L}*|kredyt\p{L}* hipoteczn\p{L}*|hypoteční poraden\p{L}*)(?![\p{L}])/iu,/(?<![\p{L}])(?:hypothe\p{L}*|hypoth\p{L}*|mortgages?|lening\p{L}*|rente\p{L}*|interest rates?|zins\p{L}*|kredit\p{L}*|credit\p{L}*|crédit\p{L}*|crédito\p{L}*|prêts?|taux|mutu[oi]|tass[oi]|financ\p{L}*|finanz\p{L}*|lån\p{L}*|laina\p{L}*|kredyt\p{L}*|huis kopen|woning kopen|eigenheim|immobilie\p{L}*|achat immobilier|compra (?:de )?casa|bolig\p{L}*|bostad\p{L}*|asunto\p{L}*|mieszkani\p{L}*|advies|adviseur\p{L}*|beratung|berater\p{L}*|conseil\p{L}*|consulen\p{L}*|asesor\p{L}*|rådgiv\p{L}*|neuvon\p{L}*|doradztw\p{L}*)(?![\p{L}])/iu,["loanorcredit","mortgageloan"]],
  // Hospitals, clinic groups and medical centres (health). "Hospital software"
  // or "for hospitals" is an audience (audienceUse).
  ["health_wellness","health_wellness","Zorg & gezondheid",/(?<![\p{L}])(?:ziekenhuis|ziekenhuizen|hospita(?:l|is|les|ls|ux)|hôpita(?:l|ux)|krankenhaus|krankenhäuser|klinikum|ospedal\p{L}*|sjukhus\p{L}*|sygehus\p{L}*|sykehus\p{L}*|sairaal\p{L}*|szpital\p{L}*|nemocnic\p{L}*|kórház\p{L}*|spital\p{L}*|νοσοκομεί\p{L}*|bolnic\p{L}*|clínicas? privadas?|grupo hospitalar|rede de (?:hospitais|clínicas|saúde)|medisch centrum|medical cent(?:er|re)s?|centre médical|centro médico|centro medico|poliambulator\p{L}*|policlinic\p{L}*|policlínic\p{L}*|poliklini\p{L}*|przychodni\p{L}*|lääkäriasem\p{L}*|terveyspalvelu\p{L}*|terveysasem\p{L}*|vårdcentral\p{L}*|legesenter\p{L}*|lægehus\p{L}*|gezondheidscentrum|huisartsenpraktijk\p{L}*|arztpraxis|ärztezentrum|medizinisches versorgungszentrum|cabinet médical|maison de santé)(?![\p{L}])/iu,/(?<![\p{L}])(?:consult\p{L}*|afspra\p{L}*|appointments?|termin\p{L}*|rendez-vous|citas?|appuntament\p{L}*|prenot\p{L}*|marca(?:r|ção)|marque|varaa|ajanvara\p{L}*|boka tid|bestill time|book tid|tidsbestilling|wizyt\p{L}*|specialist\p{L}*|especialidades?|specialit\p{L}*|médic\p{L}*|medic[io]|artsen|doctors?|ärzt\p{L}*|médecins?|lääkär\p{L}*|läkare|leger|læger|lekarz\p{L}*|patiënt\p{L}*|patients?|patienten|pacientes?|pazienti|potilai\p{L}*|urgênci\p{L}*|urgencias?|emergency|spoedeisende|notaufnahme|urgences|pronto soccorso|päivystys|akutmottagning|legevakt|zorg|care|saúde|salud|salute|santé|gesundheit|terveys|hälsa|helse|sundhed|zdrow\p{L}*)(?![\p{L}])/iu,["hospital","medicalclinic","medicalorganization"]],
  // Online booking of appointments with doctors (health platform). The booking
  // verb, the appointment and the practitioner noun must sit together.
  ["health_wellness","healthcare_booking","Zorg · online afspraken bij zorgverleners",/(?<![\p{L}])(?:prene[zr]|prendre|réserve[zr]|book|boek|buchen|vereinbaren|pide|reserva|prenota|marque|marcar|varaa|boka|bestill|umów)(?![\p{L}]).{0,40}(?<![\p{L}])(?:rendez-vous|termin\p{L}*|afspra\p{L}*|appointments?|cita|visita|consulta|aika|tid|time|wizyt\p{L}*)(?![\p{L}]).{0,60}(?<![\p{L}])(?:médecins?|arts|artsen|huisarts|ärzt\p{L}*|arzt\p{L}*|doctors?|gp|médicos?|medic[oi]|lääkär\p{L}*|läkare|lege|læge|lekarz\p{L}*|praticiens?|professionnels? de santé|soignants?|zorgverleners?|specialist\p{L}*|spécialistes?|therapeut\p{L}*|thérapeutes?|terapeut\p{L}*|tandläkare|tannlege|tandlæge|dentist\p{L}*|zahnärzt\p{L}*)(?![\p{L}])|(?<![\p{L}])(?:trouve[zr]?|find|vind|finden|encuentr\p{L}*|trova|encontr\p{L}*|hitta|finn\p{L}*|löydä|znajdź)(?![\p{L}]).{0,40}(?<![\p{L}])(?:médecins?|soignants?|praticiens?|spécialistes?|doctors?|artsen|huisarts|ärzt\p{L}*|arzt|médicos?|medic[oi]|specialist\p{L}*|lääkär\p{L}*|läkare|leger?|læger?|lekarz\p{L}*)(?![\p{L}]).{0,80}(?<![\p{L}])(?:prene[zr]|prendre|book|boek|buchen|reserv\p{L}*|pide|prenota|marque|varaa|boka|bestill|umów)(?![\p{L}]).{0,20}(?<![\p{L}])(?:rendez-vous|termin\p{L}*|afspra\p{L}*|appointments?|cita|visita|consulta|aika|tid|time|wizyt\p{L}*)(?![\p{L}])|(?<![\p{L}])(?:arzttermin\p{L}*|rendez-vous médica\p{L}*|cita médica|prenotazione visite|consultas? online)(?![\p{L}])/iu,/(?<![\p{L}])(?:médecins?|arts|artsen|ärzt\p{L}*|arzt\p{L}*|doctors?|médicos?|medic[oi]|dentist\p{L}*|tandarts\p{L}*|zahnärzt\p{L}*|specialist\p{L}*|spécialistes?|praticiens?|online|en ligne|téléconsultation|videoconsult\p{L}*|video-?sprechstunde)(?![\p{L}])/iu,[]],
  // Web hosting / domains / cloud servers (software & cloud services). A web
  // agency that also hosts its clients' sites is excluded in detectDeclaredIndustry.
  ["saas_b2b","web_hosting","Software & cloud · webhosting en domeinen",/(?<![\p{L}])(?:web ?hosting\p{L}*|hosting ?provider\p{L}*|hostingbedrijf|hostingpartij|webhoster|hébergeur\p{L}*|hébergement (?:web|de sites?)|alojamiento web|hospedagem (?:de sites|web)|hosting e domini|domini e hosting|hosting web|provider (?:di )?hosting|webhotell\p{L}*|webhotel(?:ler)?|webhotelli\p{L}*|hosting (?:company|services?)|cloud hosting|hosting)(?![\p{L}])/iu,/(?<![\p{L}])(?:domein\p{L}*|domains?|domänen?|domaines?|domini[oa]?s?|domínios?|domän\p{L}*|domæne\p{L}*|domene\p{L}*|verkkotunnu\p{L}*|domen\p{L}*|servers?|server\p{L}*|serveurs?|servidor\p{L}*|vps|cloud|ssl|datacent\p{L}*|data cent(?:er|re)s?|rechenzentr\p{L}*|e-?mail|pec|wordpress)(?![\p{L}])/iu,[]],
  // Construction and civil engineering groups (B2B industrial). Requires an
  // infrastructure / building-project context; a local contractor or renovation
  // business is not covered here (it keeps the home-services rules).
  ["manufacturing_industrial","construction_infrastructure","Bouw & infrastructuur (B2B)",/(?<![\p{L}])(?:bouwonderneming\p{L}*|bouwconcern\p{L}*|bouwgroep|construction (?:company|group|firm)|construction and (?:civil )?engineering|civil engineering (?:company|group|contractor)|bau(?:unternehme\p{L}*|konzern\p{L}*|gruppe|dienstleister\p{L}*)|bau- und (?:immobilien)?dienstleister\p{L}*|entreprise (?:générale )?de construction|groupe de construction|constructora|grupo constructor|impresa (?:di )?costruzioni|gruppo (?:di )?costruzioni|empresa de constru(?:ção|ções)|construtora|byggföretag\p{L}*|byggkoncern\p{L}*|entreprenørvirksomhed\p{L}*|entreprenørselskab\p{L}*|entreprenørkonsern\p{L}*|rakennusyhtiö\p{L}*|rakennusliike\p{L}*|firm\p{L}* budowlan\p{L}*|grup\p{L}* budowlan\p{L}*|stavební (?:firma|společnost)|építőipari)(?![\p{L}])/iu,/(?<![\p{L}])(?:infra\p{L}*|civil engineering|tunnel\p{L}*|bridges?|bruggen|brücken|ponts?|puentes?|ponti|pontes|tiefbau|hochbau|génie civil|obra civil|ingegneria civile|engenharia civil|anläggning\p{L}*|anlæg\p{L}*|anlegg\p{L}*|vesirakentami\p{L}*|railways?|spoorwegen|straßenbau|wegenbouw|carreteras|grands projets|large[- ]scale projects|großprojekte|grootschalige projecten)(?![\p{L}])/iu,["generalcontractor"]],
];
const RESERVE_TABLE=/(?<![\p{L}])(?:prenot(?:a|are|azione)\s+(?:un|il\s+tuo|il)\s+tavolo|reserv(?:e|ar|ieren|eer)\s+(?:a|una|einen|uw|je|een)\s+(?:table|mesa|tisch|tafel)|book\s+a\s+table|tafel\s+reserveren|tisch\s+reservieren|réserv(?:er|ez)\s+(?:une|votre)\s+table|reserva\s+(?:una\s+)?mesa)(?![\p{L}])/iu;
/** Local trades: businesses that serve customers in a shop, salon, practice or venue. */
export const LOCAL_TRADE_KEYS=new Set(["optician","pharmacy","hair_salon","beauty_salon","hotel","restaurant","bakery","dentist","physiotherapy","car_repair"]);
const SELF_DECLARATION=/\b(?:we (?:are|provide|offer|deliver)|(?:is|are) (?:an?|the|one of)|wij zijn|we zijn|wij bieden|we bieden|is een|zijn een|is (?:het|de|dé|hét)|nous sommes|est (?:un|une|le|la)|wir sind|ist (?:ein|eine|der|die)|somos|es (?:un|una|el|la)|siamo|è (?:un|una|il|la))\b/i;
const SUPERLATIVE=/^(?:(?:de|het|dé|le|la|les|the|die|der|il|i|el|los|las|o|os)\s+)?(?:grootste|largest|biggest|plus grand(?:e)?s?|gr[öo](?:ß|ss)ten?|più grandi|mayores|maiores|leading|toonaangevende|leidende|nummer 1|n°\s?1|no\.?\s?1)(?![\p{L}])/iu;
/** @param {string} title @param {RegExp} name @param {string} key */
const EDITORIAL_TITLE=/(?<![\p{L}])(?:\p{L}*nieuws|news|nachrichten|actualités|notizie|noticias|in beeld|in pictures|top ?\d+|ranking\p{L}*|overzicht|lijst|list(?:e|a)?|gids|guide|review\p{L}*|blog\p{L}*|magazine|magazin|tijdschrift|vergelijk\p{L}*|vergleich|comparatif|classement|klassement)(?![\p{L}])/iu;
function titleSuperlativeDeclaration(title,name,key){
  // Editorial titles ("Hotelnieuws | De grootste hotels van Europa in beeld") rank
  // OTHER businesses; they are not a self-description.
  if(EDITORIAL_TITLE.test(String(title||"")))return false;
  return String(title||"").split(/\s*[|–—]\s*|\s+-\s+/).some((segment)=>{
    const seg=segment.trim();
    return SUPERLATIVE.test(seg)&&new RegExp(name.source,name.flags.replace("g","")).test(seg)&&!audienceUse(seg,name,key);
  });
}
/** @param {string} text @param {RegExp} name @param {string} [key] */
function audienceUse(text,name,key){
  const m=new RegExp(name.source,name.flags.replace("g","")).exec(text);
  if(!m)return false;
  // A compound product word built on the trade noun ("Ziekenhuissoftware",
  // "Maklersoftware", "Hotelplattform") names a product for that market.
  if(/(?:software|systeem|systemen|system|systems|platform|plattform|crm|tools?)$/i.test(m[0])&&m[0].length>9)return true;
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
  // The brand segment of the title (before "|", "–", " - ", ":").
  const brandSegment=(fields[0].split(/\s*[|–—:]\s*|\s+-\s+/)[0]||"").trim();
  for(const [sector,key,label,name,context,types] of TYPES){
    const n=fields.flatMap((text,i)=>name.test(text)?[i]:[]);
    // QA #204: a local trade's brand often fuses the trade noun into one word
    // ("Multiópticas", "Brillenhaus", "Pizzeriaclub"): the brand names the
    // trade. Only for local trades, only in the title's brand segment, and the
    // fused form must END with the trade noun (a brand "Opticalnet" does not).
    if(LOCAL_TRADE_KEYS.has(key)&&!n.includes(0)&&brandSegment.split(/\s+/).length<=3){
      const suffix=new RegExp(name.source.replace(/^\(\?<!\[\\p\{L\}\]\)/,"\\p{L}{3,}"),name.flags.replace("g",""));
      if(suffix.test(brandSegment))n.unshift(0);
    }
    // "Prenota un tavolo", "reserve a table", "tafel reserveren": only a
    // restaurant takes table reservations; a second, independent name source.
    // Reservation software for restaurants also says "book a table": never then.
    if(key==="restaurant"&&!/(?<![\p{L}])(?:software|platform\w*|saas|plugins?|apps?|systeem|system\w*|tools?|widget)(?![\p{L}])/iu.test(fields.join(" "))){
      const reserveField=fields.findIndex((text,i)=>!n.includes(i)&&RESERVE_TABLE.test(text));
      if(reserveField>=0)n.push(reserveField);
    }
    const c=fields.flatMap((text,i)=>context.test(text)?[i]:[]);
    const typed=types.some(t=>schemas.has(t));
    // The description is the organisation's own one-sentence self-description
    // ("We provide ... legal advice", "X is an architecture practice"): naming
    // the activity there is a declaration, not a passing topic word.
    const selfDeclared=(n.includes(1)&&SELF_DECLARATION.test(fields[1])&&!audienceUse(fields[1],name,key))
      // A title segment that IS a superlative self-description of the trade ("Merk |
      // De grootste doe-het-zelf winkels van België", "Plus grands magasins de
      // bricolage"): the organisation states what it is.
      ||(n.includes(0)&&titleSuperlativeDeclaration(fields[0],name,key));
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
    // These activities are only declared together with their own context (domains
    // or servers for hosting, infrastructure for construction groups): "event
    // hosting" or a local "Bauunternehmen" for houses is something else.
    if((key==="web_hosting"||key==="construction_infrastructure") && !c.length)continue;
    // A bank's mortgage product line is decided by the bank rules.
    if(key==="financial_mortgage" && (schemas.has("bankorcreditunion") || /(?<![\p{L}])(?:bank|banque|banca|sparkasse|sparbank|sparebank|pankki|bankas|betaalrekening\p{L}*|bankrekening\p{L}*|girokont\p{L}*|current accounts?|compte courant|conto corrente|cuenta corriente|conta corrente|betalingskont\p{L}*|lönekont\p{L}*|käyttötil\p{L}*|konto osobist\p{L}*)(?![\p{L}])/iu.test(own)))continue;
    // "Schadeherstel" without any vehicle word is property damage repair, not a car body shop.
    if(key==="car_repair" && label.startsWith("Autoschade") && !/(?<![\p{L}])(?:auto\p{L}*|car|cars|voertu\p{L}*|fahrzeug\p{L}*|kfz|pkw|véhicul\p{L}*|voitures?|veicol\p{L}*|vehícul\p{L}*|coches?|carros?|bil(?:er|ar)?|ajoneuv\p{L}*|samoch\p{L}*|ruit\p{L}*|lak\p{L}*|caravan\p{L}*|camper\p{L}*|karosser\p{L}*|carross\p{L}*|carrozz\p{L}*|chapa|lackier\p{L}*|lakier\p{L}*)|(?:auto|kfz|car)(?=\p{L})/iu.test(own))continue;
    // An animal hospital is veterinary care (its own key), not human healthcare.
    if(key==="health_wellness" && /(?<![\p{L}])(?:veterin\p{L}*|vétérin\p{L}*|dieren\p{L}*|tier(?:arzt|klinik|ärzt)\p{L}*|animal\p{L}*|pets?|huisdier\p{L}*|eläinlääk\p{L}*|djursjukhus\p{L}*|dyreklinik\p{L}*|dyrlæge\p{L}*|dyrlege\p{L}*|weteryn\p{L}*|zwierz\p{L}*)(?![\p{L}])/iu.test(own))continue;
    // A web/design agency that also hosts sites is an agency, not a hosting company.
    if(key==="web_hosting" && /(?<![\p{L}])(?:webdesign\p{L}*|web design|websites? (?:laten )?(?:maken|bouwen)|webbureau|internetbureau|reclamebureau|marketingbureau|digital agency|web agency|agence web|agence digitale|webagentur|werbeagentur|agenzia (?:web|digitale)|agencia (?:web|digital)|realizzazione siti|création de sites|diseño web|criação de sites)(?![\p{L}])/iu.test(own))continue;
    if(key==="legal" && /\b(?:legal software|legal tech|software for (?:lawyers|law firms)|legal automation platform)\b/i.test(own))continue;
    // Finding PROFESSIONALS for employers is recruitment, not a service marketplace.
    if(key==="service_marketplace" && /(?<![\p{L}])(?:recrutamento|recruitment|recruiting|reclutamiento|recrutement|reclutamento|personalvermittlung|werving|uitzend\p{L}*|staffing|headhunt\p{L}*|vacatur\p{L}*|vacancies|vagas? de emprego|ofertas? de empleo|offres? d.emploi|stellenangebote?|candidat[eo]s?|kandidat\p{L}*|talent acquisition)(?![\p{L}])/iu.test(own))continue;
    // "Get a quote from OUR craftsmen" is a contractor describing its own staff,
    // not a platform connecting customers to independent workers.
    if(key==="service_marketplace" && /(?<![\p{L}])(?:onze|ons|our|unsere[nm]?|nos|nostri|nostre|nuestros|nuestras|nossos|nossas|våre|vores|våra|meidän|naszych|naszymi|nasi)\s+(?:\p{L}+\s+)?(?:vak\p{L}*|professional\p{L}*|profesional\p{L}*|profissiona\p{L}*|professionnel\p{L}*|professionist\p{L}*|h(?:å|aa)ndv(?:e|æ)rker\p{L}*|hantverkar\p{L}*|fachow\p{L}*|ammattilai\p{L}*|artisan\p{L}*|artigian\p{L}*|handwerker\p{L}*|fachleute|experts?|expert(?:en|os|s)|especialistas?|tradespeople|monteurs?|medewerkers?)(?![\p{L}])/iu.test(own))continue;
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
