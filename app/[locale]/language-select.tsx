"use client";
import { locales, type Locale } from "@/lib/locales";
const short: Record<Locale,string> = { nl:"🇳🇱 NL", en:"🇬🇧 EN", fr:"🇫🇷 FR", de:"🇩🇪 DE", it:"🇮🇹 IT", es:"🇪🇸 ES" };
export default function LanguageSelect({ locale, page = "" }: { locale: Locale; page?: string }) {
  return <select aria-label="Language / Taal" className="lc-language" value={locale} onChange={event => { window.location.href = "/" + event.target.value + (page ? "/" + page : ""); }}>
    {locales.map(language => <option key={language} value={language}>{short[language]}</option>)}
  </select>;
}
