// Common named entities seen in scanned page text, titles and attributes.
// Unknown names are left untouched so they stay visible as evidence.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  euro: "€", pound: "£", yen: "¥", cent: "¢", copy: "©", reg: "®", trade: "™",
  ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·", deg: "°", times: "×",
  lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„", laquo: "«", raquo: "»",
  agrave: "à", aacute: "á", acirc: "â", auml: "ä", aring: "å", ccedil: "ç",
  egrave: "è", eacute: "é", ecirc: "ê", euml: "ë", igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
  ntilde: "ñ", ograve: "ò", oacute: "ó", ocirc: "ô", ouml: "ö", oslash: "ø",
  ugrave: "ù", uacute: "ú", ucirc: "û", uuml: "ü", szlig: "ß",
  Agrave: "À", Aacute: "Á", Acirc: "Â", Auml: "Ä", Aring: "Å", Ccedil: "Ç",
  Egrave: "È", Eacute: "É", Ecirc: "Ê", Euml: "Ë", Iacute: "Í", Iuml: "Ï",
  Ntilde: "Ñ", Oacute: "Ó", Ocirc: "Ô", Ouml: "Ö", Oslash: "Ø", Uacute: "Ú", Uuml: "Ü",
};

// Single pass, so "&amp;lt;" becomes "&lt;" (what a browser shows), never "<".
export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      // Out-of-range or surrogate code points would make String.fromCodePoint throw.
      if (!Number.isFinite(point) || point <= 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) return "�";
      return String.fromCodePoint(point);
    }
    if (Object.hasOwn(NAMED_ENTITIES, code)) return NAMED_ENTITIES[code];
    const lower = code.toLowerCase();
    return Object.hasOwn(NAMED_ENTITIES, lower) ? NAMED_ENTITIES[lower] : match;
  });
}
