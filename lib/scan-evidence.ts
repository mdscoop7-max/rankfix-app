export type EvidenceConfidence = "high" | "medium" | "low";
export type EvidenceSource = "raw_html" | "rendered_html" | "headers" | "url" | "structured_data" | "multi_page";

export type EvidenceFact<T = boolean> = {
  value: T;
  confidence: EvidenceConfidence;
  sources: EvidenceSource[];
  evidence: string[];
};

export type ScanEvidence = {
  version: "1.2";
  page: {
    url: string;
    rendered: boolean;
    language: string | null;
    title: string | null;
  };
  commerce: {
    cart: EvidenceFact;
    addToCart: EvidenceFact;
    checkout: EvidenceFact;
    prices: EvidenceFact<{ count: number; currencies: string[] }>;
    products: EvidenceFact;
    productPage: EvidenceFact;
    productLinks: EvidenceFact<number>;
  };
  appointments: {
    appointment: EvidenceFact;
    reservation: EvidenceFact;
    booking: EvidenceFact;
    quoteRequest: EvidenceFact;
  };
  inventory: {
    vehicles: EvidenceFact;
    properties: EvidenceFact;
    jobs: EvidenceFact;
    rooms: EvidenceFact;
    menu: EvidenceFact;
  };
  organization: {
    contact: EvidenceFact;
    address: EvidenceFact;
    openingHours: EvidenceFact;
    reviews: EvidenceFact;
  };
  sectorDetails: {
    realEstate: { listing: EvidenceFact; sale: EvidenceFact; rental: EvidenceFact; };
    automotive: { service: EvidenceFact; dealer: EvidenceFact; };
    media: { article: EvidenceFact; author: EvidenceFact; publishedDate: EvidenceFact; };
    sports: { event: EvidenceFact; teamOrPlayer: EvidenceFact; resultsOrStandings: EvidenceFact; };
    lodging: { shortStay: EvidenceFact; bedBreakfast: EvidenceFact; holidayRental: EvidenceFact; holidayPark: EvidenceFact; camping: EvidenceFact; stayDates: EvidenceFact; guests: EvidenceFact; };
  };
  schema: {
    types: string[];
    organization: boolean;
    website: boolean;
    product: boolean;
    localBusiness: boolean;
    vehicle: boolean;
    realEstate: boolean;
    jobPosting: boolean;
    restaurant: boolean;
    hotel: boolean;
  };
};

const uniq = <T,>(values: T[]) => [...new Set(values)];

const fact = <T,>(value: T, confidence: EvidenceConfidence, sources: EvidenceSource[], evidence: string[]): EvidenceFact<T> => ({
  value,
  confidence,
  sources: uniq(sources),
  evidence: uniq(evidence).slice(0, 12),
});

const has = (text: string, re: RegExp) => re.test(text);

export function buildScanEvidence(input: {
  url: string;
  html: string;
  rawHtml?: string;
  rendered?: boolean;
  language?: string | null;
  title?: string | null;
}): ScanEvidence {
  const html = input.html || "";
  const rawHtml = input.rawHtml || html;
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
  const source: EvidenceSource = input.rendered ? "rendered_html" : "raw_html";
  const renderedAddsEvidence = Boolean(input.rendered && input.rawHtml && input.html !== input.rawHtml);
  const provenanceEvidence = input.rendered
    ? [renderedAddsEvidence ? "JavaScript-rendering leverde aanvullende DOM-evidence op" : "Pagina is met JavaScript-rendering beoordeeld"]
    : ["Raw HTML beoordeeld; client-side signalen kunnen ontbreken"];
  const url = input.url.toLowerCase();

  const schemaTypes = uniq([...html.matchAll(/["']@type["']\s*:\s*["']([^"']+)["']/gi)].map(m => m[1]).filter(Boolean));
  const schemaLower = schemaTypes.map(x => x.toLowerCase());
  const schemaHas = (...names: string[]) => names.some(name => schemaLower.includes(name.toLowerCase()));

  const hrefs = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
  const productLinkCount = hrefs.filter(h => /\/(?:product|products|p|artikel|artikelen|item|shop)\//i.test(h)).length;

  const cart = has(html, /(?:href|action|id|class|aria-label|data-[\w-]+)\s*=\s*["'][^"']*(?:cart|basket|winkelwagen|warenkorb|panier|carrello|carrito)[^"']*["']/i);
  const addToCart = has(text, /\b(add to cart|add to basket|in winkelwagen|toevoegen aan winkelwagen|in den warenkorb|ajouter au panier|aggiungi al carrello|añadir al carrito)\b/i);
  const checkout = has(html, /(?:href|action|id|class|aria-label|data-[\w-]+)\s*=\s*["'][^"']*(?:checkout|afrekenen|kasse|paiement|pagamento|pago)[^"']*["']/i);
  // Offer is used by service businesses too; it must never be treated as a retail product page by itself.
  const productSchema = schemaHas("Product");
  const productPathHint = /\/(?:product|products|p|artikel|item)\//i.test(url);
  const productPage = productSchema || productPathHint;

  const currencyMatches = [...text.matchAll(/(?:€|eur\b|\$|usd\b|£|gbp\b)/gi)].map(m => m[0].toUpperCase());
  const currencies = uniq(currencyMatches.map(v => v === "€" ? "EUR" : v === "$" ? "USD" : v === "£" ? "GBP" : v));
  const priceCount = [...text.matchAll(/(?:€\s*\d|\d[\d.,]*\s*(?:€|eur\b)|\$\s*\d|£\s*\d)/gi)].length;

  const appointment = has(text, /\b(afspraak|appointment|termin|rendez-vous|appuntamento|cita)\b/i);
  const reservation = has(text, /\b(reserveren|reservation|reserve a table|tisch reservieren|réserver|prenota|reservar)\b/i);
  const booking = has(text, /\b(boeken|book now|booking|buchen|réserver|prenota|reservar)\b/i);
  const quoteRequest = has(text, /\b(offerte|quote request|request a quote|angebot anfordern|devis|preventivo|presupuesto)\b/i);

  const vehicleSchema = schemaHas("Vehicle", "Car", "AutoDealer", "AutomotiveBusiness");
  const vehicleText = has(text, /\b(occasions?|proefrit|test drive|fahrzeuge?|voitures? d'occasion|auto usate)\b/i);
  const vehicles = vehicleSchema || vehicleText;
  const propertySchema = schemaHas("RealEstateAgent", "Residence", "House", "Apartment");
  const propertyText = has(text, /\b(woningen?|huizen te koop|makelaar|real estate|properties for sale|immobilien|maisons? à vendre)\b/i);
  const properties = propertySchema || propertyText;
  // A careers/vacancy mention is a secondary capability, not proof that the
  // organisation itself is a recruitment business. Structured JobPosting is
  // strong job evidence; plain navigation text remains low-confidence.
  const jobsSchema = schemaHas("JobPosting");
  const jobsText = has(text, /\b(vacatures?|solliciteren|jobs?|careers?|stellenangebote|offres d'emploi)\b/i);
  const jobs = jobsSchema || jobsText;
  const roomSchema = schemaHas("Hotel", "HotelRoom", "LodgingBusiness");
  const roomText = has(text, /\b(kamers?|rooms?|overnachting|hotelzimmer|chambres?)\b/i);
  const rooms = roomSchema || roomText;
  const menuSchema = schemaHas("Restaurant", "Menu");
  const menuText = has(text, /\b(menu|menukaart|gerechten|restaurant|speisekarte|carte des plats)\b/i);
  const menu = menuSchema || menuText;

  const contact = has(text, /\b(contact|contacteer|kontakt|contactez|contatti|contacto)\b/i) || has(html, /mailto:|tel:/i);
  const address = schemaHas("PostalAddress") || has(text, /\b(adres|address|adresse|indirizzo|dirección)\b/i);
  const openingHours = schemaHas("OpeningHoursSpecification") || has(text, /\b(openingstijden|opening hours|öffnungszeiten|horaires|orari|horario)\b/i);
  const reviews = schemaHas("Review", "AggregateRating") || has(text, /\b(reviews?|beoordelingen|bewertungen|avis|recensioni|reseñas)\b/i);
  const propertyListing = properties && (/\/(?:woningaanbod|residential-listings|properties?)\//i.test(url) || has(text, /\b(te koop|te huur|for sale|for rent|koopprijs|huurprijs)\b/i));
  const propertyListingStrong = propertySchema || (propertyText && has(text, /\b(te koop|te huur|for sale|for rent|koopprijs|huurprijs)\b/i));
  const propertySale = propertyListing && (has(text, /\b(te koop|for sale|koopprijs)\b/i) || /\/(?:koop|sale)\//i.test(url));
  const propertyRental = propertyListing && (has(text, /\b(te huur|for rent|huurprijs)\b/i) || /\/(?:huur|rent)\//i.test(url));
  const shortStay = schemaHas("Hotel","HotelRoom","LodgingBusiness","BedAndBreakfast","VacationRental","Resort","Campground") || has(text, /\b(overnachting|overnachten|per nacht|nightly|check[- ]?in|check[- ]?out|arrival|departure|aankomst|vertrek|short[- ]term stay)\b/i);
  const bedBreakfast = has(text, /\b(b&b|bed and breakfast|bed & breakfast|guesthouse|guest house|pension)\b/i) || schemaHas("BedAndBreakfast");
  const holidayRental = has(text, /\b(vakantiehuis|vakantiewoning|holiday home|holiday rental|vacation rental|ferienhaus|ferienwohnung|short[- ]term rental)\b/i) || schemaHas("VacationRental");
  const holidayPark = has(text, /\b(vakantiepark|holiday park|ferienpark|resort|bungalowpark|recreatiepark)\b/i) || schemaHas("Resort");
  const camping = has(text, /\b(camping|campingplatz|campground|camperplaats|chaletpark|caravan park|glamping)\b/i) || schemaHas("Campground");
  const stayDates = has(text, /\b(aankomst|vertrek|check[- ]?in|check[- ]?out|arrival|departure|verblijfsdata|stay dates?)\b/i);
  const guests = has(text, /\b(gasten?|guests?|personen|persons?|adults?|volwassenen|children|kinderen)\b/i);
  const automotiveService = has(text, /\b(apk|onderhoud|werkplaats|autoservice|banden|tyres?|uitlijnen|car repair|reparatie)\b/i);
  const automotiveDealer = has(text, /\b(autodealer|occasions?|auto(?:'s)? te koop|cars? for sale|proefrit|test drive)\b/i) || schemaHas("AutoDealer");
  const article = schemaHas("Article","NewsArticle","BlogPosting") || has(text, /\b(nieuws|news|artikel|article|breaking news)\b/i);
  const author = schemaHas("Person") || /\b(?:auteur|author|door|by)\s+[a-zà-ÿ][a-zà-ÿ .'-]{2,}/i.test(text);
  const publishedDate = /\b(?:datepublished|published|gepubliceerd|publicatiedatum)\b/i.test(html) || /<time\b/i.test(html);
  const sportsEvent = schemaHas("SportsEvent") || has(text, /\b(wedstrijd|match|fixture|kick-?off|wedstrijdprogramma)\b/i);
  const teamOrPlayer = schemaHas("SportsTeam") || has(text, /\b(team|speler|player|selectie|squad)\b/i);
  const resultsOrStandings = has(text, /\b(uitslag|result|standings|league table|score)\b/i);

  return {
    version: "1.2",
    page: { url: input.url, rendered: Boolean(input.rendered), language: input.language || null, title: input.title || null },
    commerce: {
      cart: fact(cart, cart ? "high" : "low", [source], cart ? ["Cart/winkelwagen-signaal gevonden", ...provenanceEvidence] : []),
      addToCart: fact(addToCart, addToCart ? "high" : "low", [source], addToCart ? ["Add-to-cart actie gevonden", ...provenanceEvidence] : []),
      checkout: fact(checkout, checkout ? "high" : "low", [source], checkout ? ["Checkout/afreken-signaal gevonden", ...provenanceEvidence] : []),
      prices: fact({ count: priceCount, currencies }, priceCount ? "high" : "low", [source], priceCount ? [`${priceCount} zichtbaar prijs-signaal/signalen; valuta: ${currencies.join(", ") || "onbekend"}`] : []),
      products: fact(productPage || productLinkCount > 0, productSchema ? "high" : productPage || productLinkCount > 0 ? "medium" : "low", [source, ...(productSchema ? ["structured_data" as EvidenceSource] : []), ...(productPathHint ? ["url" as EvidenceSource] : [])], productSchema ? ["Product-schema gevonden"] : productPathHint ? ["Productachtige URL gevonden; dit is ondersteunend bewijs, geen zelfstandig retailbewijs"] : productLinkCount ? [`${productLinkCount} productachtige interne link(s) gevonden`] : []),
      productPage: fact(productPage, productSchema ? "high" : productPathHint ? "medium" : "low", [source, ...(productSchema ? ["structured_data" as EvidenceSource] : []), ...(productPathHint ? ["url" as EvidenceSource] : [])], productSchema ? ["Productpagina bevestigd met Product-schema"] : productPathHint ? ["Productachtige URL gevonden; aanvullende product-/prijs-/actie-evidence vereist"] : []),
      productLinks: fact(productLinkCount, productLinkCount ? "medium" : "low", [source], productLinkCount ? [`${productLinkCount} productachtige interne link(s)`] : []),
    },
    appointments: {
      appointment: fact(appointment, appointment ? "medium" : "low", [source], appointment ? ["Afspraak-signaal gevonden"] : []),
      reservation: fact(reservation, reservation ? "medium" : "low", [source], reservation ? ["Reserveringssignaal gevonden"] : []),
      booking: fact(booking, booking ? "medium" : "low", [source], booking ? ["Boekingssignaal gevonden"] : []),
      quoteRequest: fact(quoteRequest, quoteRequest ? "medium" : "low", [source], quoteRequest ? ["Offerte-signaal gevonden"] : []),
    },
    inventory: {
      vehicles: fact(vehicles, vehicleSchema ? "high" : vehicles ? "medium" : "low", [source, ...(vehicleSchema ? ["structured_data" as EvidenceSource] : [])], vehicles ? [vehicleSchema ? "Voertuig-/autodealerschema gevonden" : "Voertuig/autodealer-tekstsignaal gevonden"] : []),
      properties: fact(properties, propertySchema ? "high" : properties ? "medium" : "low", [source, ...(propertySchema ? ["structured_data" as EvidenceSource] : [])], properties ? [propertySchema ? "Vastgoedschema gevonden" : "Vastgoed/woning-tekstsignaal gevonden"] : []),
      jobs: fact(jobs, jobsSchema ? "high" : "low", [source, ...(jobsSchema ? ["structured_data" as EvidenceSource] : [])], jobsSchema ? ["JobPosting-schema gevonden"] : jobsText ? ["Vacature-/carrièrevermelding gevonden; dit is geen bewijs dat recruitment de primaire sector is"] : []),
      rooms: fact(rooms, roomSchema ? "high" : rooms ? "medium" : "low", [source, ...(roomSchema ? ["structured_data" as EvidenceSource] : [])], rooms ? [roomSchema ? "Hotel-/accommodatieschema gevonden" : "Hotel/kamer-tekstsignaal gevonden"] : []),
      menu: fact(menu, menuSchema ? "high" : menu ? "medium" : "low", [source, ...(menuSchema ? ["structured_data" as EvidenceSource] : [])], menu ? [menuSchema ? "Restaurant-/menuschema gevonden" : "Restaurant/menu-tekstsignaal gevonden"] : []),
    },
    organization: {
      contact: fact(contact, contact ? "medium" : "low", [source], contact ? ["Contactsignaal gevonden"] : []),
      address: fact(address, address ? "medium" : "low", [source], address ? ["Adres-signaal gevonden"] : []),
      openingHours: fact(openingHours, openingHours ? "medium" : "low", [source], openingHours ? ["Openingstijden-signaal gevonden"] : []),
      reviews: fact(reviews, reviews ? "medium" : "low", [source], reviews ? ["Review-signaal gevonden"] : []),
    },
    sectorDetails: {
      realEstate: { listing: fact(propertyListing, propertyListingStrong ? "high" : propertyListing ? "medium" : "low", [source, ...(propertySchema ? ["structured_data" as EvidenceSource] : [])], propertyListing ? [propertyListingStrong ? "Vastgoedobject/listing met inhoudelijke evidence bevestigd" : "Vastgoedachtige listing-URL gevonden; aanvullende inhoudelijke evidence vereist"] : []), sale: fact(propertySale, propertySale ? "high" : "low", [source], propertySale ? ["Koopwoning-signaal bevestigd"] : []), rental: fact(propertyRental, propertyRental ? "high" : "low", [source], propertyRental ? ["Huurwoning-signaal bevestigd"] : []) },
      automotive: { service: fact(automotiveService, automotiveService ? "high" : "low", [source], automotiveService ? ["Garage-/autoservice-signaal bevestigd"] : []), dealer: fact(automotiveDealer, automotiveDealer ? "high" : "low", [source], automotiveDealer ? ["Autodealer-/verkoopsignaal bevestigd"] : []) },
      media: { article: fact(article, article ? "medium" : "low", [source], article ? ["Artikel-/nieuwssignaal gevonden"] : []), author: fact(author, author ? "medium" : "low", [source], author ? ["Auteurssignaal gevonden"] : []), publishedDate: fact(publishedDate, publishedDate ? "medium" : "low", [source], publishedDate ? ["Publicatiedatumsignaal gevonden"] : []) },
      sports: { event: fact(sportsEvent, sportsEvent ? "medium" : "low", [source], sportsEvent ? ["Wedstrijd-/sportevenementsignaal gevonden"] : []), teamOrPlayer: fact(teamOrPlayer, teamOrPlayer ? "medium" : "low", [source], teamOrPlayer ? ["Team-/spelersignaal gevonden"] : []), resultsOrStandings: fact(resultsOrStandings, resultsOrStandings ? "medium" : "low", [source], resultsOrStandings ? ["Uitslag-/standsignaal gevonden"] : []) },
      lodging: { shortStay: fact(shortStay, shortStay ? "high" : "low", [source], shortStay ? ["Kort verblijf/accommodatie bevestigd"] : []), bedBreakfast: fact(bedBreakfast, bedBreakfast ? "high" : "low", [source], bedBreakfast ? ["B&B/guesthouse bevestigd"] : []), holidayRental: fact(holidayRental, holidayRental ? "high" : "low", [source], holidayRental ? ["Vakantiehuis/vakantieverhuur bevestigd"] : []), holidayPark: fact(holidayPark, holidayPark ? "high" : "low", [source], holidayPark ? ["Vakantiepark/resort bevestigd"] : []), camping: fact(camping, camping ? "high" : "low", [source], camping ? ["Camping/chaletpark bevestigd"] : []), stayDates: fact(stayDates, stayDates ? "medium" : "low", [source], stayDates ? ["Aankomst/vertrek gevonden"] : []), guests: fact(guests, guests ? "medium" : "low", [source], guests ? ["Gast-/persoonsaantal gevonden"] : []) },
    },
    schema: {
      types: schemaTypes,
      organization: schemaHas("Organization", "Corporation", "LocalBusiness"),
      website: schemaHas("WebSite"),
      product: schemaHas("Product"),
      localBusiness: schemaHas("LocalBusiness"),
      vehicle: schemaHas("Vehicle", "Car", "AutoDealer", "AutomotiveBusiness"),
      realEstate: schemaHas("RealEstateAgent", "Residence", "House", "Apartment"),
      jobPosting: schemaHas("JobPosting"),
      restaurant: schemaHas("Restaurant", "FoodEstablishment"),
      hotel: schemaHas("Hotel", "HotelRoom", "LodgingBusiness"),
    },
  };
}

export type EvidencePartnerResult = {
  partner: "core" | "commerce" | "business" | "local_booking";
  status: "confirmed" | "partial" | "unconfirmed";
  confidence: EvidenceConfidence;
  capabilities: string[];
  sources: EvidenceSource[];
  evidence: string[];
};

export function collectEvidencePartners(evidence: ScanEvidence): EvidencePartnerResult[] {
  const sourceSet = (...facts: EvidenceFact<unknown>[]) => uniq(facts.flatMap(item => item.sources));
  const evidenceSet = (...facts: EvidenceFact<unknown>[]) => uniq(facts.flatMap(item => item.evidence)).slice(0, 12);
  const confidenceRank: Record<EvidenceConfidence,number> = {low:0,medium:1,high:2};
  const booleanFacts = (facts: Array<[string, EvidenceFact<boolean>]>, minimum: EvidenceConfidence = "medium") =>
    facts.filter(([, item]) => item.value && confidenceRank[item.confidence] >= confidenceRank[minimum]).map(([name]) => name);

  const coreCapabilities = [
    evidence.page.title && "title",
    evidence.page.language && "language",
    evidence.schema.organization && "organization_schema",
    evidence.schema.website && "website_schema",
  ].filter((value): value is string => Boolean(value));

  const commerceCapabilities = [
    ...booleanFacts([
      ["cart", evidence.commerce.cart],
      ["add_to_cart", evidence.commerce.addToCart],
      ["checkout", evidence.commerce.checkout],
      ["products", evidence.commerce.products],
      ["product_page", evidence.commerce.productPage],
    ]),
    (evidence.commerce.prices.value.count > 0 && confidenceRank[evidence.commerce.prices.confidence] >= confidenceRank.medium) && "pricing",
  ].filter((value): value is string => Boolean(value));

  const businessCapabilities = [
    ...booleanFacts([
      ["vehicles", evidence.inventory.vehicles],
      ["properties", evidence.inventory.properties],
      ["jobs", evidence.inventory.jobs],
      ["rooms", evidence.inventory.rooms],
      ["menu", evidence.inventory.menu],
    ], "high"),
  ];

  const localBookingCapabilities = [
    ...booleanFacts([
      ["appointment", evidence.appointments.appointment],
      ["reservation", evidence.appointments.reservation],
      ["booking", evidence.appointments.booking],
      ["quote_request", evidence.appointments.quoteRequest],
      ["contact", evidence.organization.contact],
      ["local", evidence.organization.address],
      ["opening_hours", evidence.organization.openingHours],
      ["reviews", evidence.organization.reviews],
    ]),
  ];

  const result = (
    partner: EvidencePartnerResult["partner"],
    capabilities: string[],
    sources: EvidenceSource[],
    details: string[],
    strongAt: number,
  ): EvidencePartnerResult => ({
    partner,
    status: capabilities.length >= strongAt ? "confirmed" : capabilities.length ? "partial" : "unconfirmed",
    confidence: capabilities.length >= strongAt ? "high" : capabilities.length ? "medium" : "low",
    capabilities: uniq(capabilities),
    sources: uniq(sources),
    evidence: uniq(details).slice(0, 12),
  });

  return [
    result("core", coreCapabilities, ["url", evidence.page.rendered ? "rendered_html" : "raw_html"], evidence.schema.types.map(type => `Schema: ${type}`), 2),
    result("commerce", commerceCapabilities,
      sourceSet(evidence.commerce.cart, evidence.commerce.addToCart, evidence.commerce.checkout, evidence.commerce.products, evidence.commerce.productPage, evidence.commerce.prices),
      evidenceSet(evidence.commerce.cart, evidence.commerce.addToCart, evidence.commerce.checkout, evidence.commerce.products, evidence.commerce.productPage, evidence.commerce.prices), 3),
    result("business", businessCapabilities,
      sourceSet(evidence.inventory.vehicles, evidence.inventory.properties, evidence.inventory.jobs, evidence.inventory.rooms, evidence.inventory.menu),
      evidenceSet(evidence.inventory.vehicles, evidence.inventory.properties, evidence.inventory.jobs, evidence.inventory.rooms, evidence.inventory.menu), 1),
    result("local_booking", localBookingCapabilities,
      sourceSet(evidence.appointments.appointment, evidence.appointments.reservation, evidence.appointments.booking, evidence.appointments.quoteRequest, evidence.organization.contact, evidence.organization.address, evidence.organization.openingHours, evidence.organization.reviews),
      evidenceSet(evidence.appointments.appointment, evidence.appointments.reservation, evidence.appointments.booking, evidence.appointments.quoteRequest, evidence.organization.contact, evidence.organization.address, evidence.organization.openingHours, evidence.organization.reviews), 2),
  ];
}
