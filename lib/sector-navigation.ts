// 31 Oct 2026 (five-site QA, P2): navigation as supporting sector evidence.
// Navigation never decides a sector on its own; it may only corroborate page
// evidence. Hospitality navigation is specific when it has BOTH a menu entry and
// a reservation entry (a news or shop site rarely offers "reserve a table").

const MENU = /^(?:menu|menù|menu's|menukaart|onze kaart|kaart|carte|la carte|notre carte|nos menus?|carta|nuestra carta|menú|il nostro menu|speisekarte|karte|food(?: & drinks)?|eten(?: & drinken)?)$/i;
const RESERVATION = /^(?:reserveren|reserveer|reserveer (?:een )?tafel|tafel reserveren|reserve|reservations?|book(?: a)? table|book now|prenota(?:re)?|prenota(?: un)? tavolo|prenotazioni?|réserver|réservations?|réserver une table|reservar|reservas?|reservar mesa|reservierung|reservieren|tisch reservieren)$/i;

const clean = (label: string) => String(label || "").replace(/[\s.·•|]+$/u, "").replace(/\s+/g, " ").trim();

export function hospitalityNavigationEvidence(labels: string[]): boolean {
  const items = (labels || []).map(clean).filter(Boolean);
  return items.some((label) => MENU.test(label)) && items.some((label) => RESERVATION.test(label));
}

// Services that publish their own pricing (transaction fees, plans) on
// /products/ or /pricing pages: payments, banking, insurance and SaaS. Their
// prices and pay buttons are not retail evidence by themselves.
export function isPricedServiceIdentity(key: string): boolean {
  return /^(?:financial_[a-z_]+|financial_services|payments|banking|bank|finance|insurance|saas_b2b|software_app|software)$/.test(String(key || ""));
}
