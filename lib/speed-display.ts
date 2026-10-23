import type { Locale } from "./locales.ts";
import type { SpeedDevice, SpeedFailureCode } from "./pagespeed.ts";

const messages: Record<Locale, Record<"setup" | "quota" | "connection" | "timeout" | "unavailable" | "invalid" | "budget", string>> = {
  nl:{setup:"Snelheidsmeting nog niet beschikbaar in deze omgeving.",quota:"De meetdienst heeft tijdelijk haar limiet bereikt. Probeer later opnieuw.",connection:"De verbinding met de snelheidsmeetdienst moet worden gecontroleerd.",timeout:"De meting duurde te lang; er is geen snelheidsscore vastgesteld.",unavailable:"De meetdienst leverde geen betrouwbare snelheidsmeting.",invalid:"Voor deze URL kon geen snelheidsmeting worden gestart.",budget:"Binnen deze audit was onvoldoende tijd over voor de snelheidsmeting."},
  en:{setup:"Speed measurement is not yet available in this environment.",quota:"The measurement service temporarily reached its limit. Try again later.",connection:"The connection to the speed measurement service needs attention.",timeout:"The measurement timed out; no performance score was established.",unavailable:"The service did not return a reliable performance measurement.",invalid:"A speed measurement could not be started for this URL.",budget:"This audit had insufficient time left for a speed measurement."},
  de:{setup:"Die Geschwindigkeitsmessung ist in dieser Umgebung noch nicht verfügbar.",quota:"Der Messdienst hat vorübergehend sein Limit erreicht. Bitte später erneut versuchen.",connection:"Die Verbindung zum Geschwindigkeitsmessdienst muss geprüft werden.",timeout:"Zeitüberschreitung bei der Messung; kein Leistungswert ermittelt.",unavailable:"Der Dienst lieferte keine zuverlässige Geschwindigkeitsmessung.",invalid:"Für diese URL konnte keine Geschwindigkeitsmessung gestartet werden.",budget:"In diesem Audit blieb nicht genug Zeit für die Geschwindigkeitsmessung."},
  fr:{setup:"La mesure de vitesse n’est pas encore disponible dans cet environnement.",quota:"Le service de mesure a temporairement atteint sa limite. Réessayez plus tard.",connection:"La connexion au service de mesure de vitesse doit être vérifiée.",timeout:"La mesure a expiré ; aucun score de performance n’a été établi.",unavailable:"Le service n’a pas fourni de mesure de vitesse fiable.",invalid:"La mesure de vitesse n’a pas pu démarrer pour cette URL.",budget:"Il ne restait pas assez de temps dans cet audit pour mesurer la vitesse."},
  it:{setup:"La misurazione della velocità non è ancora disponibile in questo ambiente.",quota:"Il servizio di misurazione ha temporaneamente raggiunto il limite. Riprova più tardi.",connection:"La connessione al servizio di misurazione della velocità deve essere verificata.",timeout:"La misurazione è scaduta; nessun punteggio di prestazione è stato confermato.",unavailable:"Il servizio non ha fornito una misurazione affidabile della velocità.",invalid:"Non è stato possibile avviare la misurazione per questo URL.",budget:"In questa analisi non restava tempo sufficiente per misurare la velocità."},
  es:{setup:"La medición de velocidad aún no está disponible en este entorno.",quota:"El servicio de medición alcanzó temporalmente su límite. Inténtalo más tarde.",connection:"Es necesario revisar la conexión con el servicio de medición de velocidad.",timeout:"La medición agotó el tiempo; no se confirmó una puntuación de rendimiento.",unavailable:"El servicio no devolvió una medición de velocidad fiable.",invalid:"No se pudo iniciar la medición de velocidad para esta URL.",budget:"No quedaba tiempo suficiente en esta auditoría para medir la velocidad."},
};
export function speedFailureMessage(value: Pick<SpeedDevice,"reason" | "reasonCode"> | null | undefined, locale: Locale): string {
  let code: SpeedFailureCode | undefined | null = value?.reasonCode;
  // Existing saved reports predate diagnostic codes. Hide their API-key jargon
  // from customer views without altering any stored measurement or score.
  if (!code && /API-sleutel|API-key|niet ingesteld/i.test(value?.reason || "")) code = "not_configured";
  if (!code && /limiet|429/i.test(value?.reason || "")) code = "quota_limited";
  if (!code && /timeout/i.test(value?.reason || "")) code = "timeout";
  const key = code === "not_configured" ? "setup" : code === "quota_limited" ? "quota"
    : code === "key_rejected" || code === "api_disabled" ? "connection" : code === "timeout" ? "timeout"
    : code === "invalid_url" ? "invalid" : code === "scan_budget_exhausted" ? "budget" : "unavailable";
  return messages[locale][key];
}

/** Lab metrics as Google reports them; a missing metric is "—", never a guess. */
export function formatSpeedLab(lab: SpeedDevice["lab"] | null | undefined): string {
  const seconds = (ms: number | null | undefined) => (ms == null ? "—" : `${(ms / 1000).toFixed(2)} s`);
  const cls = lab?.cls == null ? "—" : String(Math.round(lab.cls * 1000) / 1000);
  const tbt = lab?.tbtMs == null ? "—" : `${Math.round(lab.tbtMs)} ms`;
  return `FCP ${seconds(lab?.fcpMs)} · LCP ${seconds(lab?.lcpMs)} · CLS ${cls} · TBT ${tbt} · SI ${seconds(lab?.speedIndexMs)}`;
}
