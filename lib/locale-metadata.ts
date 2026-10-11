import type { Metadata } from "next";
import { copy, locales, type Locale } from "./locales";
import { SITE_URL } from "./site-url";

const base = new URL(SITE_URL);
const ogLocale: Record<Locale, string> = { nl: "nl_NL", en: "en_GB", de: "de_DE", fr: "fr_FR", it: "it_IT", es: "es_ES" };

// Child metadata replaces openGraph/twitter as a whole, so every page sets the full set.
export function socialMetadata(url: string, title: string, description: string, locale: Locale = "nl"): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: { type: "website", url, siteName: "RankFix AI", locale: ogLocale[locale], title, description, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
  };
}

export function localeMetadata(locale: Locale, page = "", override?: { title?: string; description?: string }): Metadata {
  const data = copy[locale];
  const title = override?.title ? override.title : page === "about" ? data.aboutTitle : page === "privacy" ? data.privacyTitle : page === "terms" ? data.termsTitle : page === "cookies" ? data.cookiesTitle : page === "scan" ? data.run : data.hero;
  const suffix = page ? "/" + page : "";
  const description = override?.description ? override.description : page === "about" ? data.about[0] : page === "privacy" || page === "terms" || page === "cookies" ? data.legalNote : data.intro;
  return {
    metadataBase: base,
    title: title + " | RankFix AI",
    description,
    alternates: {
      canonical: "/" + locale + suffix,
      languages: { ...Object.fromEntries(locales.map(language => [language, "/" + language + suffix])), "x-default": "/nl" + suffix },
    },
    ...socialMetadata("/" + locale + suffix, title + " | RankFix AI", description, locale),
  };
}
