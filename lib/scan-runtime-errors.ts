/**
 * Customer-facing scan infrastructure failure classification.
 * Never exposes internal database URLs, SQL, provider tokens or stack traces.
 * A quota failure is not a website SEO/GEO problem and is not retryable now.
 */
export type ScanInfrastructureFailure = {
  code:"DATABASE_QUOTA_EXCEEDED"|"SCAN_DATABASE_UNCONFIGURED";
  httpStatus:503;
  retryable:false;
  charged:false;
  message:Record<"nl"|"en"|"de"|"fr"|"it"|"es",string>;
};

export function classifyScanInfrastructureFailure(error:unknown):ScanInfrastructureFailure|null {
  const message=error instanceof Error ? error.message : typeof error==="string"?error:"";
  const missing=/\bDATABASE_URL\b.*(?:ontbreekt|missing|not set|undefined)|(?:missing|ontbreekt)\s+\bDATABASE_URL\b/i.test(message);
  const quota=/(?:neondberror|neon(?:\s|db)|postgres|database|db\.query)[\s\S]{0,400}(?:exceeded (?:the )?quota|quota exceeded|quota limit|HTTP status 402|SQLSTATE\s*53000)|(?:exceeded (?:the )?quota|quota exceeded)[\s\S]{0,400}(?:neon|postgres|database)/i.test(message);
  if (!missing && !quota)return null;
  if (missing)return {
    code:"SCAN_DATABASE_UNCONFIGURED",httpStatus:503,retryable:false,charged:false,
    message:{
      nl:"RankFix kan nu niet scannen: de testomgeving heeft geen databaseverbinding. Dit is een technisch probleem van RankFix, niet van de onderzochte website. Probeer de scan opnieuw wanneer de verbinding is hersteld.",
      en:"RankFix cannot scan right now: this environment has no database connection. This is a RankFix infrastructure issue, not a problem with the website. Retry after the connection is restored.",
      de:"RankFix kann momentan nicht scannen: In dieser Umgebung fehlt die Datenbankverbindung. Das ist ein RankFix-Problem, kein Fehler der untersuchten Website.",
      fr:"RankFix ne peut pas lancer l'analyse : la connexion à la base de données est absente. Il s'agit d'un problème technique de RankFix, pas du site analysé.",
      it:"RankFix non può eseguire la scansione: manca la connessione al database. È un problema tecnico di RankFix, non del sito esaminato.",
      es:"RankFix no puede realizar el análisis: falta la conexión a la base de datos. Es un problema técnico de RankFix, no del sitio analizado.",
    }
  };
  return {
    code:"DATABASE_QUOTA_EXCEEDED",httpStatus:503,retryable:false,charged:false,
    message:{
      nl:"De RankFix-scan is tijdelijk niet beschikbaar omdat de testdatabase haar limiet heeft bereikt. Dit is geen SEO/GEO-fout van jouw website. Er is niets in rekening gebracht; probeer opnieuw nadat de database is hersteld.",
      en:"The RankFix scan is temporarily unavailable because its test database reached its quota. This is not an SEO/GEO issue with your website. You were not charged.",
      de:"Der RankFix-Scan ist vorübergehend nicht verfügbar: Das Datenbankkontingent ist erschöpft. Dies ist kein SEO/GEO-Fehler der untersuchten Website. Es wurde nichts berechnet.",
      fr:"L'analyse RankFix est temporairement indisponible, car le quota de la base de données est atteint. Ce n'est pas un défaut SEO/GEO du site. Aucun frais n'a été prélevé.",
      it:"La scansione RankFix non è disponibile: la quota del database è esaurita. Non è un difetto SEO/GEO del sito. Nessun addebito.",
      es:"El análisis de RankFix no está disponible porque se agotó la cuota de la base de datos. No es un fallo SEO/GEO del sitio. Sin cargos.",
    }
  };
}
