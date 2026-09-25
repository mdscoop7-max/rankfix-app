import { notFound } from "next/navigation";
import { copy, isLocale, locales } from "@/lib/locales";
import { localeMetadata } from "@/lib/locale-metadata";
import LocaleShell from "../shell";
import { aboutContent } from "@/lib/about-content";
import { termsContent } from "@/lib/terms-content";
const pages = ["about", "privacy", "terms", "cookies"] as const;
type Page = typeof pages[number];
export function generateStaticParams() { return locales.flatMap(locale => pages.map(page => ({ locale, page }))); }
export async function generateMetadata({ params }: { params: Promise<{ locale: string; page: string }> }) { const { locale, page } = await params; return isLocale(locale) && pages.includes(page as Page) ? localeMetadata(locale, page) : {}; }
export default async function LocalizedInfo({ params }: { params: Promise<{ locale: string; page: string }> }) {
  const { locale, page } = await params; if (!isLocale(locale) || !pages.includes(page as Page)) notFound();
  const t = copy[locale];
  const title = page === "about" ? t.aboutTitle : page === "privacy" ? t.privacyTitle : page === "terms" ? t.termsTitle : t.cookiesTitle;
  const paragraphs = page === "about" ? t.about : page === "privacy" ? t.privacy : page === "terms" ? t.terms : t.cookies;
  const about = aboutContent[locale];
  return <LocaleShell locale={locale} page={page}><article className="lc-container lc-prose"><h1>{page === "about" ? about.title : page === "terms" && locale === "nl" ? termsContent.title : title}</h1>{page === "about" ? about.sections.map((section, index) => <section key={index}><h2>{section.heading}</h2>{section.paragraphs?.map((paragraph, i) => <p key={i}>{paragraph}</p>)}{section.bullets && <ul>{section.bullets.map((item, i) => <li key={i}>{item}</li>)}</ul>}{section.values && <ol>{section.values.map((item, i) => <li key={i}>{item}</li>)}</ol>}</section>) : page === "terms" && locale === "nl" ? <><p>{termsContent.version}</p><p className="lc-note">{termsContent.notice} Betaalde abonnementen en facturatie zijn momenteel niet beschikbaar.</p>{termsContent.sections.map((section, index) => <section key={index}><h2>{section.heading}</h2>{section.intro && <p>{section.intro}</p>}<ol>{section.items.map((item, i) => <li key={i}>{item}</li>)}</ol></section>)}</> : paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}{page !== "about" && <p className="lc-note">{t.legalNote}</p>}</article></LocaleShell>;
}
