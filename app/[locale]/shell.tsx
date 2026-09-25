import { copy, type Locale } from "@/lib/locales";
import LanguageSelect from "./language-select";
import "./locale.css";
export default function LocaleShell({ locale, page = "", children }: { locale: Locale; page?: string; children: React.ReactNode }) {
  const t = copy[locale];
  return <main className="lc-page" lang={locale}>
    <header className="lc-header"><div className="lc-container"><a className="lc-brand" href={"/" + locale}>RankFix <span>AI</span></a>
      <nav className="lc-nav" aria-label="Main navigation"><a href={"/" + locale + "/scan"}>{t.nav[0]}</a><a href={"/" + locale + "#how"}>{t.nav[1]}</a><a href={"/" + locale + "#audience"}>{t.nav[2]}</a><a href={"/" + locale + "#pricing"}>{t.nav[3]}</a><a href={"/" + locale + "#contact"}>{t.nav[4]}</a><a href={"/account?lang=" + locale}>{t.signIn}</a><LanguageSelect locale={locale} page={page} /></nav>
      <details className="lc-mobile-menu"><summary>☰ Menu</summary><div className="lc-mobile-links"><a href={"/" + locale + "/scan"}>{t.nav[0]}</a><a href={"/" + locale + "#how"}>{t.nav[1]}</a><a href={"/" + locale + "#audience"}>{t.nav[2]}</a><a href={"/" + locale + "#pricing"}>{t.nav[3]}</a><a href={"/" + locale + "#contact"}>{t.nav[4]}</a><a href={"/account?lang=" + locale}>{t.signIn}</a><LanguageSelect locale={locale} page={page} /></div></details>
    </div></header>
    {children}
    <footer className="lc-footer"><div className="lc-container"><span>© 2026 RankFix AI</span><div className="lc-footer-links"><a href={"/" + locale + "/about"}>{t.aboutTitle}</a><a href={"/" + locale + "/privacy"}>{t.privacyTitle}</a><a href={"/" + locale + "/terms"}>{t.termsTitle}</a><a href={"/" + locale + "/cookies"}>{t.cookiesTitle}</a></div></div></footer>
  </main>;
}
