// FAQ evidence requires an actual question paired with an answer.
// A lone "FAQ" heading or unrelated details/accordion is not proof.
//
// QA international-28 / 144 (25 Oct): questions were only recognised by a
// trailing "?" or by Dutch/English/French/German question words, and only in
// <details> or a heading directly followed by one paragraph. Spanish "¿…?",
// Greek ";" and the question words of the other European languages were missed,
// as were common accordion markups (button + panel, <dt>/<dd>, schema.org
// microdata, an answer wrapped in a few <div>s). The rule is unchanged: a
// question AND a visible answer of at least 12 characters.
const visible = (s: string) => s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/\s+/g," ").trim();
// Interrogative words that open a question, per language (NL, EN, DE, FR, ES,
// IT, PT, Nordic, FI, PL, CS/SK, HU, RO, HR/SL, ET, LV, LT, EL).
const QUESTION_START = new RegExp(String.raw`^(?:` + [
  "hoe", "wat", "waar", "wanneer", "waarom", "welke?", "wie", "kan", "kun", "kunt", "mag", "moet", "is", "zijn", "heb", "hebben", "wordt", "worden",
  "how", "what", "when", "where", "why", "which", "who", "can", "could", "do", "does", "did", "is", "are", "will", "should", "may",
  "wie", "was", "wann", "wo", "warum", "welche[rsn]?", "kann", "können", "gibt", "muss", "darf", "ist", "sind", "wird",
  "comment", "pourquoi", "quand", "où", "quel(?:le)?s?", "qui", "que", "qu'est-ce", "qu’est-ce", "est-ce", "puis-je", "peut-on", "combien",
  "cómo", "qué", "cuándo", "cuando", "dónde", "donde", "por qué", "cuál(?:es)?", "quién", "cuánto", "puedo", "se puede",
  "cosa", "quando", "dove", "perché", "quale", "quali", "chi", "quanto", "posso", "si può",
  "o que", "por que", "qual", "quais", "quem", "quanto", "posso", "é possível",
  "hvordan", "hvad", "hvor", "hvornår", "hvorfor", "hvilke?", "hvem", "kan jeg", "hva", "når", "hur", "vad", "varför", "vilken", "vilka", "vem", "kan man",
  "miten", "mitä", "mikä", "missä", "milloin", "miksi", "kuka", "voinko", "onko",
  "jak", "gdzie", "kiedy", "dlaczego", "który", "która", "które", "czy", "ile",
  "kde", "kdy", "proč", "který", "která", "lze", "mohu", "ako", "čo", "kedy", "prečo",
  "hogyan", "hol", "mikor", "miért", "melyik", "lehet",
  "unde", "când", "de ce",
  "kako", "što", "šta", "kaj", "gdje", "kje", "kada", "kdaj", "zašto", "zakaj",
  "kuidas", "kus", "millal", "miks", "kodėl", "kaip",
  "πώς", "τι", "πού", "πότε", "γιατί", "ποιο[ςι]?",
].join("|") + String.raw`)(?![\p{L}])`, "iu");
export const isQuestion = (s: string) => {
  const t = s.trim();
  if (/[?？؟]$/.test(t) || /^¿/.test(t)) return true;
  // Greek uses ";" as its question mark.
  if (/;$/.test(t) && /[\u0370-\u03ff]/.test(t)) return true;
  // An interrogative opening only counts for a sentence-like heading (3+ words).
  return t.split(/\s+/).length >= 3 && QUESTION_START.test(t);
};
const answered = (a: string) => visible(a).length >= 12;
// Owner decision (25 Oct, Terveystalo field case): a promotional teaser that ends
// in "?" ("Huolestuttaako nuoren vointi?" + a webinar/service line) is not a FAQ.
// Promotion/event/call-to-action wording in the "answer" disqualifies a pair.
const PROMO = /(?<![\p{L}])(?:webinar\p{L}*|webinaari\p{L}*|livestream\p{L}*|aanmelden|meld (?:je|u) aan|inschrijven|schrijf (?:je|u) in|register(?: now)?|sign up|anmelden|jetzt anmelden|inscri(?:vez|re|ption)\p{L}*|iscriviti|regístrate|inscríbete|inscreva-se|ilmoittaudu|anmäl\p{L}*|meld deg på|tilmeld\p{L}*|zapisz się|lees meer|read more|learn more|mehr erfahren|en savoir plus|scopri di più|descubre más|saiba mais|lue lisää|läs mer|les mer|læs mere|czytaj więcej|ontdek|bekijk|discover|entdecken|découvrez|aanbieding|actie|korting|rabatt|angebot des monats|offerta|oferta|promo\p{L}*|kampanj\p{L}*|kampanja\p{L}*|campagne|campaign|klo \d|\d{1,2}[.:]\d{2}\s?[-–]\s?\d{1,2}(?:[.:]\d{2})?)(?![\p{L}])/iu;
// A FAQ the page itself labels, in the EU/EEA languages.
const FAQ_LABEL = /(?<![\p{L}])(?:faqs?|q ?& ?a|veelgestelde vragen|veel gestelde vragen|frequently asked questions|häufig gestellte fragen|häufige fragen|questions fréquentes|foire aux questions|preguntas frecuentes|domande frequenti|perguntas frequentes|ofte stillede spørgsmål|vanliga frågor|ofte stilte spørsmål|usein kysyt\p{L}*|najczęściej zadawane pytania|często zadawane pytania|časté dotazy|často kladené otázky|gyakori kérdések|întrebări frecvente|korduma kippuvad küsimused|biežāk uzdotie jautājumi|dažniausiai užduodami klausimai|συχνές ερωτήσεις|često postavljana pitanja|pogosta vprašanja)(?![\p{L}])/iu;
const stems4 = (t: string) => new Set((t.toLowerCase().match(/\p{L}{5,}/gu) || []).map((w) => w.slice(0, 5)));
/** The answer is about the question: it shares a content-word stem, and it is not promotion. */
export function answersQuestion(q: string, a: string): boolean {
  const answer = visible(a);
  if (answer.length < 12 || PROMO.test(answer)) return false;
  const qs = stems4(q);
  if (!qs.size) return true;
  const as = stems4(answer);
  return [...qs].some((x) => as.has(x));
}
export function confirmedFaqContent(html: string): boolean {
  for(const m of html.matchAll(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)) {
    const q = visible(m[1]);
    if(isQuestion(q) && answered(m[2]) && !PROMO.test(visible(m[2]))) return true;
  }
  // Heading question followed by its answer, possibly inside a few wrappers (the
  // heading may hold long inner markup; its visible text must read as a question).
  // Headings are how teasers and campaign cards are built too, so a heading pair
  // counts only on a page that labels a FAQ section, or as a series of at least
  // three pairs; every pair must answer its question and not be promotion.
  const pageLabelsFaq = FAQ_LABEL.test(visible(html));
  let headingPairs = 0;
  for(const m of html.matchAll(/<h([2-6])\b[^>]*>((?:(?!<h[1-6]\b)[\s\S]){1,2000}?)<\/h\1>\s*(?:<\/?(?:div|section|span)\b[^>]*>\s*){0,4}<(?:p|div|span|section)\b[^>]*>([\s\S]{0,4000}?)<\/(?:p|div|span|section)>/gi)) {
    const q = visible(m[2]);
    if(q.length <= 250 && isQuestion(q) && answersQuestion(q, m[3])) headingPairs++;
  }
  if(headingPairs >= 3 || (headingPairs >= 1 && pageLabelsFaq)) return true;
  // Definition list.
  for(const m of html.matchAll(/<dt\b[^>]*>([\s\S]{1,400}?)<\/dt>\s*<dd\b[^>]*>([\s\S]{0,4000}?)<\/dd>/gi)) {
    if(isQuestion(visible(m[1])) && answered(m[2]) && !PROMO.test(visible(m[2]))) return true;
  }
  // Accordion: a toggle button holding the question, then its panel.
  for(const m of html.matchAll(/<button\b[^>]*aria-(?:expanded|controls)\s*=[^>]*>([\s\S]{1,400}?)<\/button>\s*(?:<\/?(?:h[2-6]|div|span)\b[^>]*>\s*){0,4}<(?:div|section|p)\b[^>]*>([\s\S]{0,4000}?)<\/(?:div|section|p)>/gi)) {
    if(isQuestion(visible(m[1])) && answered(m[2]) && !PROMO.test(visible(m[2]))) return true;
  }
  // schema.org microdata Question / acceptedAnswer.
  if(/itemtype\s*=\s*["'][^"']*schema\.org\/Question["']/i.test(html) && /itemprop\s*=\s*["']acceptedAnswer["']/i.test(html)) {
    const text = html.match(/itemprop\s*=\s*["']text["'][^>]*>([\s\S]{0,4000}?)</i)?.[1] || "";
    if(answered(text)) return true;
  }
  return false;
}
