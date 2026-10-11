// FAQ evidence requires an actual question paired with an answer.
// A lone "FAQ" heading or unrelated details/accordion is not proof.
const visible = (s: string) => s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
const question = (s: string) => /\?\s*$/.test(s) || /^(?:hoe|wat|waar|wanneer|waarom|welke|kan|kun|is|zijn|how|what|when|where|why|can|do|does|is|are|comment|pourquoi|wie|was|wann|wo)\b/i.test(s);
export function confirmedFaqContent(html: string): boolean {
  for(const m of html.matchAll(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)) {
    if(question(visible(m[1])) && visible(m[2]).length >= 12) return true;
  }
  for(const m of html.matchAll(/<h[2-6]\b[^>]*>([\s\S]*?)<\/h[2-6]>\s*(?:<div[^>]*>\s*)?<(?:p|div)\b[^>]*>([\s\S]*?)<\/(?:p|div)>/gi)) {
    if(question(visible(m[1])) && visible(m[2]).length >= 12) return true;
  }
  return false;
}
