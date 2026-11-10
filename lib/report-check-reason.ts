export type ReasonCheck = {message?:string;reasonCode?:string;status?:string};

/** Display the recorded limitation. Keywords cannot establish which scan ran. */
export function reportCheckReason(check: ReasonCheck, language: string): string {
  const recorded = typeof check.message === "string" ? check.message.trim() : "";
  if (recorded) return recorded;
  if (language !== "nl") return "Evidence was insufficient for a definitive result.";
  switch (check.reasonCode) {
    case "needs_js": return "Runtimegedrag kon voor deze controle niet worden bevestigd; de beschikbare gegevens bewijzen niet welke interacties zijn onderzocht.";
    case "cap_absent": return "Deze controle is niet van toepassing volgens de opgeslagen beoordeling.";
    case "insufficient_pages": return "Er is onvoldoende bewijs van representatieve pagina's voor deze controle.";
    case "access_refused": return "De benodigde pagina's weigerden toegang; dit is geen bewezen websitefout.";
    case "type_uncertain": return "Er is onvoldoende bewijs om te bepalen of deze controle van toepassing is.";
    default: return check.status === "not_applicable"
      ? "Deze controle is niet van toepassing volgens de opgeslagen beoordeling."
      : "Onvoldoende controleerbaar bewijs om deze controle betrouwbaar te bevestigen.";
  }
}
