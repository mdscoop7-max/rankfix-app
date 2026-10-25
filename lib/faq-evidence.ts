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
export function confirmedFaqContent(html: string): boolean {
  for(const m of html.matchAll(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)) {
    if(isQuestion(visible(m[1])) && answered(m[2])) return true;
  }
  // Heading question followed by its answer, possibly inside up to three wrappers.
  for(const m of html.matchAll(/<h[2-6]\b[^>]*>([\s\S]{1,400}?)<\/h[2-6]>\s*(?:<\/?(?:div|section|span)\b[^>]*>\s*){0,4}<(?:p|div|span|section)\b[^>]*>([\s\S]{0,4000}?)<\/(?:p|div|span|section)>/gi)) {
    if(isQuestion(visible(m[1])) && answered(m[2])) return true;
  }
  // Definition list.
  for(const m of html.matchAll(/<dt\b[^>]*>([\s\S]{1,400}?)<\/dt>\s*<dd\b[^>]*>([\s\S]{0,4000}?)<\/dd>/gi)) {
    if(isQuestion(visible(m[1])) && answered(m[2])) return true;
  }
  // Accordion: a toggle button holding the question, then its panel.
  for(const m of html.matchAll(/<button\b[^>]*aria-(?:expanded|controls)\s*=[^>]*>([\s\S]{1,400}?)<\/button>\s*(?:<\/?(?:h[2-6]|div|span)\b[^>]*>\s*){0,4}<(?:div|section|p)\b[^>]*>([\s\S]{0,4000}?)<\/(?:div|section|p)>/gi)) {
    if(isQuestion(visible(m[1])) && answered(m[2])) return true;
  }
  // schema.org microdata Question / acceptedAnswer.
  if(/itemtype\s*=\s*["'][^"']*schema\.org\/Question["']/i.test(html) && /itemprop\s*=\s*["']acceptedAnswer["']/i.test(html)) {
    const text = html.match(/itemprop\s*=\s*["']text["'][^>]*>([\s\S]{0,4000}?)</i)?.[1] || "";
    if(answered(text)) return true;
  }
  return false;
}
