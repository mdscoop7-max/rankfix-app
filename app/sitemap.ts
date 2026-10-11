import type { MetadataRoute } from "next";
import { locales } from "@/lib/locales";
import { SITE_URL } from "@/lib/site-url";

// Every public, indexable page in every language, with its hreflang alternates.
const localizedPages = ["", "/scan", "/help", "/contact", "/about", "/privacy", "/terms", "/cookies"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const localized = localizedPages.flatMap((page) => {
    const languages = { ...Object.fromEntries(locales.map((locale) => [locale, `${SITE_URL}/${locale}${page}`])), "x-default": `${SITE_URL}/nl${page}` };
    const legal = page === "/privacy" || page === "/terms" || page === "/cookies";
    return locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${page}`,
      changeFrequency: legal ? "monthly" as const : "weekly" as const,
      priority: page === "" ? 0.9 : legal ? 0.3 : 0.7,
      alternates: { languages },
    }));
  });
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pricing`, changeFrequency: "weekly", priority: 0.8 },
    ...localized,
  ];
}
