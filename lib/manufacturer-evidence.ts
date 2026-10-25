/**
 * Manufacturer brands that also sell direct (QA #186).
 *
 * A cart and checkout prove a sales channel, not that the organisation is a
 * retailer. A retailer sells other companies' products; a manufacturer offers
 * services that only make sense for products it makes itself: registering a
 * purchase for warranty, and parts/accessories for its own products. Such a
 * page, on the site itself, is structural evidence of a manufacturer. It is
 * never applied when the site describes itself as a shop (webshop, online
 * store, "online kopen"), and it never decides on URL vocabulary alone: the
 * page must have been fetched and its own title/description must say it.
 */
const REGISTRATION = /(?:register (?:your |a )?(?:new )?(?:product|purchase|appliance|device)|product registration|registr(?:ation|ieren) (?:of )?(?:your )?product|produkt(?:registrierung| registrieren)|gerät registrieren|garantie(?:registrierung| registrieren| verlängern)|registreer (?:je|uw) (?:product|apparaat|aankoop)|productregistratie|product registreren|enregistr(?:ez|er|ement)(?: de)? (?:votre |un )?(?:produit|appareil)|registra(?:zione)? (?:il tuo |del )?prodott|registr(?:a|ar|o)(?: de)? (?:tu |su )?(?:producto|aparato)|warranty registration|extend(?:ed)? warranty)/i;
const REGISTRATION_PATH = /\/(?:register-your-product|product-registration|registration|produktregistrierung|produkt-registrieren|registreer-product|productregistratie|enregistrer-produit|enregistrement-produit|registra-prodotto|registro-producto|registrar-producto|warranty-registration)(?:\/|$)/i;

export type ManufacturerPage = { url: string; status: string; title?: string | null; description?: string | null };

// Services for products the organisation makes itself, by model number:
// repair/exchange, user manuals, spare parts, firmware. One such page can exist
// on a retailer too; TWO different kinds on own pages (and no shop identity,
// checked by the caller) are manufacturer evidence. Multilingual.
const OWN_PRODUCT_SUPPORT: Array<[string, RegExp]> = [
  ["repair", /(?:reparatie of omruiling|reparatie en ruilen|repair (?:or|and) (?:exchange|replacement)|reparatur (?:oder|und) austausch|réparation (?:ou|et) (?:échange|remplacement)|riparazione (?:o|e) sostituzione|reparación (?:o|y) (?:cambio|sustitución))/i],
  ["manuals", /(?:gebruikershandleiding(?:en)?|handleidingen|user manuals?|bedienungsanleitung(?:en)?|modes? d'emploi|manuali d'uso|manuales de usuario)/i],
  ["parts", /(?:reserveonderdelen|onderdelen en accessoires|spare parts|ersatzteile|pièces détachées|ricambi|piezas de repuesto)/i],
  ["model", /(?:modelnummer|model number|modellnummer|numéro de modèle|numero di modello|número de modelo)/i],
  ["firmware", /(?:firmware|software-update|softwareupdates?)/i],
];

export function manufacturerRegistrationEvidence(pages: ManufacturerPage[]): { url: string; evidence: string } | null {
  for (const page of pages) {
    if (page.status !== "audited") continue;
    const own = `${page.title || ""} ${page.description || ""}`;
    let path = "";
    try { path = new URL(page.url).pathname; } catch { continue; }
    // The fetched page itself must describe product registration; the path only
    // corroborates (a URL alone never decides).
    if (REGISTRATION.test(own) || (REGISTRATION_PATH.test(path) && /\b(?:register|registr|garantie|warranty|enregistr)/i.test(own))) {
      return { url: page.url, evidence: `Eigen pagina voor registratie van gekochte producten (garantie/ondersteuning van eigen producten): ${page.url}` };
    }
  }
  // Second route (QA 144: the registration page is not always in the sample).
  const kinds = new Map<string, string>();
  for (const page of pages) {
    if (page.status !== "audited") continue;
    const own = `${page.title || ""} ${page.description || ""}`;
    for (const [kind, re] of OWN_PRODUCT_SUPPORT) if (!kinds.has(kind) && re.test(own)) { kinds.set(kind, page.url); break; }
  }
  const urls = [...new Set(kinds.values())];
  if (kinds.size >= 2 && urls.length >= 2) {
    return { url: urls[0], evidence: `Eigen ondersteuningspagina's voor eigen producten (${[...kinds.keys()].join(", ")}): ${urls.slice(0, 2).join(", ")}` };
  }
  return null;
}
