import { notFound } from "next/navigation";
import { copy, isLocale, locales } from "@/lib/locales";
import { localeMetadata } from "@/lib/locale-metadata";
import LocaleShell from "../shell";
const pages = ["about", "privacy", "terms", "cookies"] as const;
type Page = typeof pages[number];
export function generateStaticParams() { return locales.flatMap(locale => pages.map(page => ({ locale, page }))); }
export async function generateMetadata({ params }: { params: Promise<{ locale: string; page: string }> }) { const { locale, page } = await params; return isLocale(locale) && pages.includes(page as Page) ? localeMetadata(locale, page) : {}; }
export default async function LocalizedInfo({ params }: { params: Promise<{ locale: string; page: string }> }) {
  const { locale, page } = await params; if (!isLocale(locale) || !pages.includes(page as Page)) notFound();
  const t = copy[locale];
  const title = page === "about" ? t.aboutTitle : page === "privacy" ? t.privacyTitle : page === "terms" ? t.termsTitle : t.cookiesTitle;
  const paragraphs = page === "about" ? t.about : page === "privacy" ? t.privacy : page === "terms" ? t.terms : t.cookies;
  return <LocaleShell locale={locale} page={page}><article className="lc-container lc-prose"><h1>{title}</h1>{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}{page !== "about" && <p className="lc-note">{t.legalNote}</p>}</article></LocaleShell>;
}
