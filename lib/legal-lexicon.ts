/** Evidence-only multilingual legal navigation; labels are not legal compliance. */
export function normalizeLegalText(value:string):string {
  let text=value;
  try {text=decodeURIComponent(text);}catch{}
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
}

export const LEGAL_LINK_LEXICON = {
  privacy:/\b(?:privacy|privacybeleid|privacyverklaring|privacy policy|privacidade|privatnost\w*|zasebnost\w*|datenschutz\w*|privatsphare|confidentialite|vie privee|privacidad|riservatezza|integritet\w*|personuppgift\w*|dataskydd\w*|personvern\w*|persondata\w*|privatliv\w*|databeskyttelse\w*|tietosuoja\w*|yksityisyy\w*|prywatnosc\w*|ochrona danych|ochrana osobnich udaju|ochrana osobnych udajov|ochrana soukromi|adatvedelem\w*|adatkezel\w*|confidentialitate|protectia datelor|andmekaitse\w*|privaatsus\w*|privatum\w*|privatuma|privatumo|zastita podataka|varstvo osebnih podatkov|gdpr|rgpd|dsgvo|rodo)\b/i,
  cookies:/\b(?:cookie\w*|cookie\s+(?:settings|preferences|policy|richtlinie|einstellungen)|piskotk\w*|kolacic\w*|galleta\w*|biscott\w*|evaste\w*|ciasteczk\w*|kakor|informasjonskapsl\w*|sutikim\w*|privatsphare\s+(?:einstellungen|settings)|datenschutz\s+(?:einstellungen|settings)|consent\s+settings|privacy\s+(?:preferences|settings))\b/i,
  terms:/\b(?:voorwaarden|terms|conditions|agb|cgv|condiciones|condizioni|termos|uvjet\w*|pogoj\w*|conditions generales|villkor\w*|vilkar\w*|betingelser|salgsbetingelser|handelsbetingelser|kayttoehdo\w*|toimitusehdo\w*|myyntiehdo\w*|regulamin\w*|obchodni podminky|obchodne podmienky|aszf|felhasznalasi feltetel\w*|termeni\w*|tingimused|noteikumi|salygos|nutzungsbedingungen|kopvillkor\w*|anvandarvillkor\w*|kjopsvilkar\w*|kobsbetingelser)\b/i,
};
export function matchedLegalSignals(href:string,label:string):{privacy:boolean;cookies:boolean;terms:boolean} {
  const source=normalizeLegalText(href+" "+label);
  return {
    privacy:LEGAL_LINK_LEXICON.privacy.test(source),
    cookies:LEGAL_LINK_LEXICON.cookies.test(source),
    terms:LEGAL_LINK_LEXICON.terms.test(source),
  };
}
