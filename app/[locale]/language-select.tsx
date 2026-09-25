"use client";
import { useRouter } from "next/navigation";
import { locales, type Locale } from "@/lib/locales";
const short: Record<Locale,string> = { nl:"🇳🇱 NL", en:"🇬🇧 EN", fr:"🇫🇷 FR", de:"🇩🇪 DE", it:"🇮🇹 IT", es:"🇪🇸 ES" };
export default function LanguageSelect({ locale, page = "" }: { locale: Locale; page?: string }) {
  const router = useRouter();
  return <select aria-label="Language / Taal" className="lc-language" value={locale} onChange={event => router.push("/" + event.target.value + (page ? "/" + page : ""))}>
    {locales.map(language => <option key={language} value={language}>{short[language]}</option>)}
  </select>;
}
