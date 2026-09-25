"use client";
import { useRouter } from "next/navigation";
import { languageNames, locales, type Locale } from "@/lib/locales";
export default function LanguageSelect({ locale, page = "" }: { locale: Locale; page?: string }) {
  const router = useRouter();
  return <select aria-label="Language / Taal" className="lc-language" value={locale} onChange={event => router.push("/" + event.target.value + (page ? "/" + page : ""))}>
    {locales.map(language => <option key={language} value={language}>{languageNames[language]}</option>)}
  </select>;
}
