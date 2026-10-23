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
  return null;
}
