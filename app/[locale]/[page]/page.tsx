import { notFound } from "next/navigation";
import { copy, isLocale, locales } from "@/lib/locales";
import { localeMetadata } from "@/lib/locale-metadata";
import { aboutContent } from "@/lib/about-content";
import { termsContent } from "@/lib/terms-content";
import { privacyContent } from "@/lib/privacy-content";
import { cookiesContent } from "@/lib/cookies-content";
import LocaleShell from "../shell";

const pages = ["about", "privacy", "terms", "cookies"] as const;
type Page = typeof pages[number];
export function generateStaticParams() { return locales.flatMap(locale => pages.map(page => ({ locale, page }))); }
export async function generateMetadata({ params }: { params: Promise<{ locale: string; page: string }> }) {
  const { locale, page } = await params;
  return isLocale(locale) && pages.includes(page as Page) ? localeMetadata(locale, page) : {};
}

export default async function LocalizedInfo({ params }: { params: Promise<{ locale: string; page: string }> }) {
  const { locale, page } = await params;
  if (!isLocale(locale) || !pages.includes(page as Page)) notFound();
  const t = copy[locale];
  const title = page === "about" ? t.aboutTitle : page === "privacy" ? t.privacyTitle : page === "terms" ? t.termsTitle : t.cookiesTitle;
  const paragraphs = page === "about" ? t.about : page === "privacy" ? t.privacy : page === "terms" ? t.terms : t.cookies;
  const about = aboutContent[locale];
  const detailed = locale === "nl" ? page === "privacy" ? privacyContent : page === "cookies" ? cookiesContent : null : null;
  return <LocaleShell locale={locale} page={page}>
    <article className="lc-container lc-prose">
      <h1>{page === "about" ? about.title : page === "terms" && locale === "nl" ? termsContent.title : detailed?.title || title}</h1>
      {page === "about" ? about.sections.map((section, index) => <section key={index}>
        <h2>{section.heading}</h2>
        {section.paragraphs?.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
        {section.bullets && <ul>{section.bullets.map((item, i) => <li key={i}>{item}</li>)}</ul>}
        {section.values && <ol>{section.values.map((item, i) => <li key={i}>{item}</li>)}</ol>}
      </section>) : detailed ? <>
        <p className="lc-note">{detailed.version}</p>
        {detailed.intro.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
        {detailed.sections.map((section, index) => <section key={index}>
          <h2>{section.heading}</h2>
          {section.paragraphs?.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
          {section.bullets && <ul>{section.bullets.map((item, i) => <li key={i}>{item}</li>)}</ul>}
          {"items" in section && section.items && <ol>{section.items.map((item, i) => <li key={i}>{item}</li>)}</ol>}
          {"table" in section && section.table && <div className="lc-table-wrap"><table><thead><tr><th>Categorie</th><th>Naam</th><th>Doel</th><th>Bewaartermijn</th></tr></thead><tbody>{section.table.map(row => <tr key={row.name}><td>{row.category}</td><td><code>{row.name}</code></td><td>{row.purpose}</td><td>{row.retention}</td></tr>)}</tbody></table></div>}
          {"closing" in section && section.closing?.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
        </section>)}
      </> : page === "terms" && locale === "nl" ? <>
        <p>{termsContent.version}</p>
        <p className="lc-note">{termsContent.notice} Betaalde abonnementen en facturatie zijn momenteel niet beschikbaar.</p>
        {termsContent.sections.map((section, index) => <section key={index}>
          <h2>{section.heading}</h2>
          {section.intro && <p>{section.intro}</p>}
          <ol>{section.items.map((item, i) => <li key={i}>{item}</li>)}</ol>
        </section>)}
      </> : paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      {page !== "about" && <p className="lc-note">{t.legalNote}</p>}
    </article>
  </LocaleShell>;
}
