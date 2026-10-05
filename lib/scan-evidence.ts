export type EvidenceConfidence = "high" | "medium" | "low";
export type EvidenceSource = "raw_html" | "rendered_html" | "headers" | "url" | "structured_data" | "multi_page";

export type EvidenceFact<T = boolean> = {
  value: T;
  confidence: EvidenceConfidence;
  sources: EvidenceSource[];
  evidence: string[];
};

export type ScanEvidence = {
  version: "1.0";
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
  const url = input.url.toLowerCase();

  const schemaTypes = uniq([...html.matchAll(/["']@type["']\s*:\s*["']([^"']+)["']/gi)].map(m => m[1]).filter(Boolean));
  const schemaLower = schemaTypes.map(x => x.toLowerCase());
  const schemaHas = (...names: string[]) => names.some(name => schemaLower.includes(name.toLowerCase()));

  const hrefs = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
  const productLinkCount = hrefs.filter(h => /\/(?:product|products|p|artikel|artikelen|item|shop)\//i.test(h)).length;

  const cart = has(html, /(?:cart|basket|winkelwagen|warenkorb|panier|carrello|carrito)/i);
  const addToCart = has(text, /\b(add to cart|add to basket|in winkelwagen|toevoegen aan winkelwagen|in den warenkorb|ajouter au panier|aggiungi al carrello|añadir al carrito)\b/i);
  const checkout = has(html, /(?:checkout|afrekenen|kasse|paiement|pagamento|pago)/i);
  const productPage = schemaHas("Product", "Offer") || /\/(?:product|products|p|artikel|item)\//i.test(url);

  const currencyMatches = [...text.matchAll(/(?:€|eur\b|\$|usd\b|£|gbp\b)/gi)].map(m => m[0].toUpperCase());
  const currencies = uniq(currencyMatches.map(v => v === "€" ? "EUR" : v === "$" ? "USD" : v === "£" ? "GBP" : v));
  const priceCount = [...text.matchAll(/(?:€\s*\d|\d[\d.,]*\s*(?:€|eur\b)|\$\s*\d|£\s*\d)/gi)].length;

  const appointment = has(text, /\b(afspraak|appointment|termin|rendez-vous|appuntamento|cita)\b/i);
  const reservation = has(text, /\b(reserveren|reservation|reserve a table|tisch reservieren|réserver|prenota|reservar)\b/i);
  const booking = has(text, /\b(boeken|book now|booking|buchen|réserver|prenota|reservar)\b/i);
  const quoteRequest = has(text, /\b(offerte|quote request|request a quote|angebot anfordern|devis|preventivo|presupuesto)\b/i);

  const vehicles = schemaHas("Vehicle", "Car", "AutoDealer", "AutomotiveBusiness") || has(text, /\b(occasions?|proefrit|test drive|fahrzeuge?|voitures? d'occasion|auto usate)\b/i);
  const properties = schemaHas("RealEstateAgent", "Residence", "House", "Apartment") || has(text, /\b(woningen?|huizen te koop|makelaar|real estate|properties for sale|immobilien|maisons? à vendre)\b/i);
  // A careers/vacancy mention is a secondary capability, not proof that the
  // organisation itself is a recruitment business. Structured JobPosting is
  // strong job evidence; plain navigation text remains low-confidence.
  const jobsSchema = schemaHas("JobPosting");
  const jobsText = has(text, /\b(vacatures?|solliciteren|jobs?|careers?|stellenangebote|offres d'emploi)\b/i);
  const jobs = jobsSchema || jobsText;
  const rooms = schemaHas("Hotel", "HotelRoom", "LodgingBusiness") || has(text, /\b(kamers?|rooms?|overnachting|hotelzimmer|chambres?)\b/i);
  const menu = schemaHas("Restaurant", "Menu") || has(text, /\b(menu|menukaart|gerechten|restaurant|speisekarte|carte des plats)\b/i);

  const contact = has(text, /\b(contact|contacteer|kontakt|contactez|contatti|contacto)\b/i) || has(html, /mailto:|tel:/i);
  const address = schemaHas("PostalAddress") || has(text, /\b(adres|address|adresse|indirizzo|dirección)\b/i);
  const openingHours = schemaHas("OpeningHoursSpecification") || has(text, /\b(openingstijden|opening hours|öffnungszeiten|horaires|orari|horario)\b/i);
  const reviews = schemaHas("Review", "AggregateRating") || has(text, /\b(reviews?|beoordelingen|bewertungen|avis|recensioni|reseñas)\b/i);
  const propertyListing = properties && (/\/(?:woningaanbod|residential-listings|properties?)\//i.test(url) || has(text, /\b(te koop|te huur|for sale|for rent|koopprijs|huurprijs)\b/i));
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
    version: "1.0",
    page: { url: input.url, rendered: Boolean(input.rendered), language: input.language || null, title: input.title || null },
    commerce: {
      cart: fact(cart, cart ? "high" : "low", [source], cart ? ["Cart/winkelwagen-signaal gevonden"] : []),
      addToCart: fact(addToCart, addToCart ? "high" : "low", [source], addToCart ? ["Add-to-cart actie gevonden"] : []),
      checkout: fact(checkout, checkout ? "high" : "low", [source], checkout ? ["Checkout/afreken-signaal gevonden"] : []),
      prices: fact({ count: priceCount, currencies }, priceCount ? "high" : "low", [source], priceCount ? [`${priceCount} zichtbaar prijs-signaal/signalen; valuta: ${currencies.join(", ") || "onbekend"}`] : []),
      products: fact(productPage || productLinkCount > 0, productPage ? "high" : productLinkCount > 0 ? "medium" : "low", [source, ...(schemaHas("Product") ? ["structured_data" as EvidenceSource] : [])], productPage ? ["Productpagina/schema-signaal gevonden"] : productLinkCount ? [`${productLinkCount} productachtige interne link(s) gevonden`] : []),
      productPage: fact(productPage, productPage ? "high" : "low", [source, ...(schemaHas("Product", "Offer") ? ["structured_data" as EvidenceSource] : [])], productPage ? ["Productpaginabewijs gevonden"] : []),
      productLinks: fact(productLinkCount, productLinkCount ? "medium" : "low", [source], productLinkCount ? [`${productLinkCount} productachtige interne link(s)`] : []),
    },
    appointments: {
      appointment: fact(appointment, appointment ? "medium" : "low", [source], appointment ? ["Afspraak-signaal gevonden"] : []),
      reservation: fact(reservation, reservation ? "medium" : "low", [source], reservation ? ["Reserveringssignaal gevonden"] : []),
      booking: fact(booking, booking ? "medium" : "low", [source], booking ? ["Boekingssignaal gevonden"] : []),
      quoteRequest: fact(quoteRequest, quoteRequest ? "medium" : "low", [source], quoteRequest ? ["Offerte-signaal gevonden"] : []),
    },
    inventory: {
      vehicles: fact(vehicles, vehicles ? "medium" : "low", [source], vehicles ? ["Voertuig/autodealer-signaal gevonden"] : []),
      properties: fact(properties, properties ? "medium" : "low", [source], properties ? ["Vastgoed/woning-signaal gevonden"] : []),
      jobs: fact(jobs, jobsSchema ? "high" : "low", [source, ...(jobsSchema ? ["structured_data" as EvidenceSource] : [])], jobsSchema ? ["JobPosting-schema gevonden"] : jobsText ? ["Vacature-/carrièrevermelding gevonden; dit is geen bewijs dat recruitment de primaire sector is"] : []),
      rooms: fact(rooms, rooms ? "medium" : "low", [source], rooms ? ["Hotel/kamer-signaal gevonden"] : []),
      menu: fact(menu, menu ? "medium" : "low", [source], menu ? ["Restaurant/menu-signaal gevonden"] : []),
    },
    organization: {
      contact: fact(contact, contact ? "medium" : "low", [source], contact ? ["Contactsignaal gevonden"] : []),
      address: fact(address, address ? "medium" : "low", [source], address ? ["Adres-signaal gevonden"] : []),
      openingHours: fact(openingHours, openingHours ? "medium" : "low", [source], openingHours ? ["Openingstijden-signaal gevonden"] : []),
      reviews: fact(reviews, reviews ? "medium" : "low", [source], reviews ? ["Review-signaal gevonden"] : []),
    },
    sectorDetails: {
      realEstate: { listing: fact(propertyListing, propertyListing ? "high" : "low", [source], propertyListing ? ["Vastgoedobject/listing bevestigd"] : []), sale: fact(propertySale, propertySale ? "high" : "low", [source], propertySale ? ["Koopwoning-signaal bevestigd"] : []), rental: fact(propertyRental, propertyRental ? "high" : "low", [source], propertyRental ? ["Huurwoning-signaal bevestigd"] : []) },
      automotive: { service: fact(automotiveService, automotiveService ? "high" : "low", [source], automotiveService ? ["Garage-/autoservice-signaal bevestigd"] : []), dealer: fact(automotiveDealer, automotiveDealer ? "high" : "low", [source], automotiveDealer ? ["Autodealer-/verkoopsignaal bevestigd"] : []) },
      media: { article: fact(article, article ? "medium" : "low", [source], article ? ["Artikel-/nieuwssignaal gevonden"] : []), author: fact(author, author ? "medium" : "low", [source], author ? ["Auteurssignaal gevonden"] : []), publishedDate: fact(publishedDate, publishedDate ? "medium" : "low", [source], publishedDate ? ["Publicatiedatumsignaal gevonden"] : []) },
      sports: { event: fact(sportsEvent, sportsEvent ? "medium" : "low", [source], sportsEvent ? ["Wedstrijd-/sportevenementsignaal gevonden"] : []), teamOrPlayer: fact(teamOrPlayer, teamOrPlayer ? "medium" : "low", [source], teamOrPlayer ? ["Team-/spelersignaal gevonden"] : []), resultsOrStandings: fact(resultsOrStandings, resultsOrStandings ? "medium" : "low", [source], resultsOrStandings ? ["Uitslag-/standsignaal gevonden"] : []) },
      lodging: { shortStay: fact(shortStay, shortStay ? "high" : "low", [source], shortStay ? ["Kort verblijf/accommodatie bevestigd"] : []), bedBreakfast: fact(bedBreakfast, bedBreakfast ? "high" : "low", [source], bedBreakfast ? ["B&B/guesthouse bevestigd"] : []), holidayRental: fact(holidayRental, holidayRental ? "high" : "low", [source], holidayRental ? ["Vakantiehuis/vakantieverhuur bevestigd"] : []), holidayPark: fact(holidayPark, holidayPark ? "high" : "low", [source], holidayPark ? ["Vakantiepark/resort bevestigd"] : []), camping: fact(camping, camping ? "high" : "low", [source], camping ? ["Camping/chaletpark bevestigd"] : []), stayDates: fact(stayDates, stayDates ? "medium" : "low", [source], stayDates ? ["Aankomst/vertrek gevonden"] : []), guests: fact(guests, guests ? "medium" : "low", [source], guests ? ["Gast-/persoonsaantal gevonden"] : []) },
    },
    schema: {
      types: schemaTypes,
      organization: schemaHas("Organization", "Corporation", "LocalBusiness"),
      website: schemaHas("WebSite"),
      product: schemaHas("Product", "Offer"),
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
  const booleanFacts = (facts: Array<[string, EvidenceFact<boolean>]>) =>
    facts.filter(([, item]) => item.value).map(([name]) => name);

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
    evidence.commerce.prices.value.count > 0 && "pricing",
  ].filter((value): value is string => Boolean(value));

  const businessCapabilities = [
    ...booleanFacts([
      ["vehicles", evidence.inventory.vehicles],
      ["properties", evidence.inventory.properties],
      ["jobs", evidence.inventory.jobs],
      ["rooms", evidence.inventory.rooms],
      ["menu", evidence.inventory.menu],
    ]),
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

export function mergeScanEvidence(base: ScanEvidence, additional: ScanEvidence): ScanEvidence {
  const mergeFact = <T,>(a: EvidenceFact<T>, b: EvidenceFact<T>, choose: (x: T, y: T) => T): EvidenceFact<T> => ({
    value: choose(a.value, b.value),
    confidence: a.confidence === "high" || b.confidence === "high" ? "high" : a.confidence === "medium" || b.confidence === "medium" ? "medium" : "low",
    sources: uniq([...a.sources, ...b.sources, "multi_page"]),
    evidence: uniq([...a.evidence, ...b.evidence]).slice(0, 12),
  });
  const or = (a:boolean,b:boolean)=>a||b;
  const max = (a:number,b:number)=>Math.max(a,b);
  return {
    ...base,
    commerce: {
      cart: mergeFact(base.commerce.cart, additional.commerce.cart, or),
      addToCart: mergeFact(base.commerce.addToCart, additional.commerce.addToCart, or),
      checkout: mergeFact(base.commerce.checkout, additional.commerce.checkout, or),
      prices: mergeFact(base.commerce.prices, additional.commerce.prices, (a,b)=>({count:Math.max(a.count,b.count),currencies:uniq([...a.currencies,...b.currencies])})),
      products: mergeFact(base.commerce.products, additional.commerce.products, or),
      productPage: mergeFact(base.commerce.productPage, additional.commerce.productPage, or),
      productLinks: mergeFact(base.commerce.productLinks, additional.commerce.productLinks, max),
    },
    appointments: {
      appointment: mergeFact(base.appointments.appointment, additional.appointments.appointment, or),
      reservation: mergeFact(base.appointments.reservation, additional.appointments.reservation, or),
      booking: mergeFact(base.appointments.booking, additional.appointments.booking, or),
      quoteRequest: mergeFact(base.appointments.quoteRequest, additional.appointments.quoteRequest, or),
    },
    inventory: {
      vehicles: mergeFact(base.inventory.vehicles, additional.inventory.vehicles, or),
      properties: mergeFact(base.inventory.properties, additional.inventory.properties, or),
      jobs: mergeFact(base.inventory.jobs, additional.inventory.jobs, or),
      rooms: mergeFact(base.inventory.rooms, additional.inventory.rooms, or),
      menu: mergeFact(base.inventory.menu, additional.inventory.menu, or),
    },
    organization: {
      contact: mergeFact(base.organization.contact, additional.organization.contact, or),
      address: mergeFact(base.organization.address, additional.organization.address, or),
      openingHours: mergeFact(base.organization.openingHours, additional.organization.openingHours, or),
      reviews: mergeFact(base.organization.reviews, additional.organization.reviews, or),
    },
    sectorDetails: {
      realEstate: { listing: mergeFact(base.sectorDetails.realEstate.listing, additional.sectorDetails.realEstate.listing, or), sale: mergeFact(base.sectorDetails.realEstate.sale, additional.sectorDetails.realEstate.sale, or), rental: mergeFact(base.sectorDetails.realEstate.rental, additional.sectorDetails.realEstate.rental, or) },
      automotive: { service: mergeFact(base.sectorDetails.automotive.service, additional.sectorDetails.automotive.service, or), dealer: mergeFact(base.sectorDetails.automotive.dealer, additional.sectorDetails.automotive.dealer, or) },
      media: { article: mergeFact(base.sectorDetails.media.article, additional.sectorDetails.media.article, or), author: mergeFact(base.sectorDetails.media.author, additional.sectorDetails.media.author, or), publishedDate: mergeFact(base.sectorDetails.media.publishedDate, additional.sectorDetails.media.publishedDate, or) },
      sports: { event: mergeFact(base.sectorDetails.sports.event, additional.sectorDetails.sports.event, or), teamOrPlayer: mergeFact(base.sectorDetails.sports.teamOrPlayer, additional.sectorDetails.sports.teamOrPlayer, or), resultsOrStandings: mergeFact(base.sectorDetails.sports.resultsOrStandings, additional.sectorDetails.sports.resultsOrStandings, or) },
      lodging: { shortStay: mergeFact(base.sectorDetails.lodging.shortStay, additional.sectorDetails.lodging.shortStay, or), bedBreakfast: mergeFact(base.sectorDetails.lodging.bedBreakfast, additional.sectorDetails.lodging.bedBreakfast, or), holidayRental: mergeFact(base.sectorDetails.lodging.holidayRental, additional.sectorDetails.lodging.holidayRental, or), holidayPark: mergeFact(base.sectorDetails.lodging.holidayPark, additional.sectorDetails.lodging.holidayPark, or), camping: mergeFact(base.sectorDetails.lodging.camping, additional.sectorDetails.lodging.camping, or), stayDates: mergeFact(base.sectorDetails.lodging.stayDates, additional.sectorDetails.lodging.stayDates, or), guests: mergeFact(base.sectorDetails.lodging.guests, additional.sectorDetails.lodging.guests, or) },
    },
    schema: {
      types: uniq([...base.schema.types, ...additional.schema.types]),
      organization: base.schema.organization || additional.schema.organization,
      website: base.schema.website || additional.schema.website,
      product: base.schema.product || additional.schema.product,
      localBusiness: base.schema.localBusiness || additional.schema.localBusiness,
      vehicle: base.schema.vehicle || additional.schema.vehicle,
      realEstate: base.schema.realEstate || additional.schema.realEstate,
      jobPosting: base.schema.jobPosting || additional.schema.jobPosting,
      restaurant: base.schema.restaurant || additional.schema.restaurant,
      hotel: base.schema.hotel || additional.schema.hotel,
    },
  };
}
