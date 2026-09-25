import type { Metadata } from "next";
import { copy, locales, type Locale } from "./locales";

const base = new URL("https://rankfix-app.onrender.com");
export function localeMetadata(locale: Locale, page = ""): Metadata {
  const data = copy[locale];
  const title = page === "about" ? data.aboutTitle : page === "privacy" ? data.privacyTitle : page === "terms" ? data.termsTitle : page === "cookies" ? data.cookiesTitle : page === "scan" ? data.run : data.hero;
  const suffix = page ? "/" + page : "";
  return {
    metadataBase: base,
    title: title + " | RankFix AI",
    description: page === "about" ? data.about[0] : page === "privacy" || page === "terms" || page === "cookies" ? data.legalNote : data.intro,
    alternates: {
      canonical: "/" + locale + suffix,
      languages: { ...Object.fromEntries(locales.map(language => [language, "/" + language + suffix])), "x-default": "/nl" + suffix },
    },
  };
}
