/**
 * schema.org type hierarchy helpers. A page that declares a more specific type
 * (OnlineStore, FurnitureStore, Dentist, Restaurant, Corporation, ...) does declare an
 * Organization: schema.org defines those types as subtypes of Organization. Treating only
 * the literal "Organization" as identity schema produced false "missing Organization"
 * findings on webshops and local businesses.
 */

// Direct and indirect subtypes of https://schema.org/Organization (lower-case), excluding
// the ~100 LocalBusiness store types, which all end in "store" and are matched by suffix.
const ORGANIZATION_SUBTYPES = new Set([
  "organization", "corporation", "ngo", "airline", "consortium", "fundingscheme", "librarysystem",
  "onlinebusiness", "onlinestore", "politicalparty", "researchorganization", "searchrescueorganization",
  "workersunion", "newsmediaorganization", "governmentorganization", "project", "fundingagency", "researchproject",
  "educationalorganization", "collegeoruniversity", "elementaryschool", "highschool", "middleschool", "preschool", "school",
  "performinggroup", "dancegroup", "musicgroup", "theatergroup", "sportsorganization", "sportsteam",
  "medicalorganization", "diagnosticlab", "hospital", "medicalclinic", "pharmacy", "physician", "veterinarycare", "dentist",
  // LocalBusiness and its non-store subtypes
  "localbusiness", "animalshelter", "archiveorganization", "childcare", "drycleaningorlaundry", "employmentagency",
  "internetcafe", "library", "professionalservice", "radiostation", "realestateagent", "recyclingcenter", "selfstorage",
  "shoppingcenter", "televisionstation", "touristinformationcenter", "travelagency",
  "automotivebusiness", "autobodyshop", "autodealer", "autorental", "autorepair", "autowash", "gasstation", "motorcycledealer", "motorcyclerepair",
  "emergencyservice", "firestation", "policestation",
  "entertainmentbusiness", "adultentertainment", "amusementpark", "artgallery", "casino", "comedyclub", "movietheater", "nightclub",
  "financialservice", "accountingservice", "automatedteller", "bankorcreditunion", "insuranceagency",
  "foodestablishment", "bakery", "barorpub", "brewery", "cafeorcoffeeshop", "distillery", "fastfoodrestaurant", "icecreamshop", "restaurant", "winery",
  "governmentoffice", "postoffice",
  "healthandbeautybusiness", "beautysalon", "dayspa", "hairsalon", "healthclub", "nailsalon", "tattooparlor",
  "homeandconstructionbusiness", "electrician", "generalcontractor", "hvacbusiness", "housepainter", "locksmith", "movingcompany", "plumber", "roofingcontractor",
  "legalservice", "attorney", "notary",
  "lodgingbusiness", "bedandbreakfast", "campground", "hostel", "hotel", "motel", "resort", "vacationrental",
  "medicalbusiness", "communityhealth", "dermatology", "dietnutrition", "emergency", "geriatric", "gynecologic", "midwifery",
  "nursing", "obstetric", "oncologic", "optician", "optometric", "otolaryngologic", "pediatric", "physiotherapy",
  "plasticsurgery", "podiatric", "primarycare", "psychiatric", "publichealth",
  "sportsactivitylocation", "bowlingalley", "exercisegym", "golfcourse", "publicswimmingpool", "skiresort", "sportsclub", "stadiumorarena", "tenniscomplex",
]);

const normalize = (type: unknown) => String(type || "").trim().replace(/^(?:https?:\/\/)?schema\.org\//i, "").toLowerCase();

/** True when a schema.org @type is Organization or one of its subtypes. */
export function isOrganizationType(type: unknown): boolean {
  const value = normalize(type);
  if (!value) return false;
  // All schema.org store types (Store, OnlineStore, FurnitureStore, ...) are Organizations.
  return ORGANIZATION_SUBTYPES.has(value) || value.endsWith("store");
}

/** The first declared type that counts as Organization, for evidence text. */
export function organizationTypeIn(types: Iterable<unknown>): string | null {
  for (const type of types) if (isOrganizationType(type)) return String(type);
  return null;
}
