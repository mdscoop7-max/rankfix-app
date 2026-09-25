import { copy, type Locale } from "@/lib/locales";
import LanguageSelect from "./language-select";
import MobileNav from "./mobile-nav";
import AiAssistant from "@/components/ai-assistant";
import "./locale.css";
export default function LocaleShell({ locale, page = "", children }: { locale: Locale; page?: string; children: React.ReactNode }) {
  const t = copy[locale];
  return <main className="lc-page" lang={locale}>
    <header className="lc-header"><div className="lc-container"><a className="lc-brand" href={"/" + locale}>RankFix <span>AI</span></a>
      <nav className="lc-nav" aria-label="Main navigation"><a href={"/" + locale + "/scan"}>{t.nav[0]}</a><a href={"/" + locale + "#how"}>{t.nav[1]}</a><a href={"/" + locale + "#audience"}>{t.nav[2]}</a><a href={"/" + locale + "#pricing"}>{t.nav[3]}</a><a href={"/" + locale + "#contact"}>{t.nav[4]}</a><a href={"/account?lang=" + locale}>{t.signIn}</a><LanguageSelect locale={locale} page={page} /></nav>
      <details className="lc-mobile-menu"><summary><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16 M4 12h16 M4 18h16" /></svg><span>Menu</span></summary><div className="lc-mobile-links"><a href={"/" + locale + "/scan"}>{t.nav[0]}</a><a href={"/" + locale + "#how"}>{t.nav[1]}</a><a href={"/" + locale + "#audience"}>{t.nav[2]}</a><a href={"/" + locale + "#pricing"}>{t.nav[3]}</a><a href={"/" + locale + "#contact"}>{t.nav[4]}</a><a href={"/account?lang=" + locale}>{t.signIn}</a><LanguageSelect locale={locale} page={page} /></div></details>
    </div></header>
    {children}
    <footer className="lc-footer">
      <div className="lc-container lc-footer-grid">
        <div className="lc-footer-brand"><div className="lc-footer-logo"><span>RF</span><strong>RankFix AI</strong></div><p>{locale==="nl"?"SEO + GEO auditsoftware voor bedrijven en agencies die willen weten wat ze moeten fixen — en het daarna ook willen fixen.":locale==="en"?"SEO + GEO audit software for businesses and agencies that want to know what to fix — and then fix it.":locale==="de"?"SEO- und GEO-Auditsoftware für Unternehmen und Agenturen, die wissen wollen, was sie verbessern müssen — und es anschließend beheben.":locale==="fr"?"Logiciel d’audit SEO + GEO pour les entreprises et agences qui veulent savoir quoi corriger — puis le corriger.":locale==="it"?"Software di audit SEO + GEO per aziende e agenzie che vogliono sapere cosa correggere — e poi correggerlo.":"Software de auditoría SEO + GEO para empresas y agencias que quieren saber qué corregir — y después corregirlo."}</p></div>
        <div><strong>{locale==="nl"?"Product":locale==="en"?"Product":locale==="de"?"Produkt":locale==="fr"?"Produit":locale==="it"?"Prodotto":"Producto"}</strong><div className="lc-footer-column"><a href={"/"+locale+"/scan"}>SEO Audit</a><a href={"/"+locale+"/scan"}>GEO Audit</a><a href={"/"+locale+"#how"}>{locale==="fr"?"Correctifs IA":locale==="es"?"Mejoras IA":locale==="de"?"AI-Fixes":locale==="it"?"Fix AI":"AI Fixes"}</a><a href={"/"+locale+"/scan"}>{locale==="nl"?"Rapporten":locale==="en"?"Reports":locale==="de"?"Berichte":locale==="fr"?"Rapports":locale==="it"?"Report":"Informes"}</a></div></div>
        <div><strong>{locale==="nl"?"Voor wie":locale==="en"?"For whom":locale==="de"?"Für wen":locale==="fr"?"Pour qui":locale==="it"?"Per chi":"Para quién"}</strong><div className="lc-footer-column"><a href={"/"+locale+"#audience"}>{locale==="nl"?"Bedrijven":locale==="en"?"Businesses":locale==="de"?"Unternehmen":locale==="fr"?"Entreprises":locale==="it"?"Aziende":"Empresas"}</a><a href={"/"+locale+"#audience"}>{locale==="nl"?"Webshops":locale==="en"?"Online stores":locale==="de"?"Onlineshops":locale==="fr"?"Boutiques en ligne":locale==="it"?"Negozi online":"Tiendas online"}</a><a href={"/"+locale+"#audience"}>{locale==="nl"?"Agencies":locale==="en"?"Agencies":locale==="de"?"Agenturen":locale==="fr"?"Agences":locale==="it"?"Agenzie":"Agencias"}</a><a href={"/"+locale+"#audience"}>SaaS</a></div></div>
        <div><strong>{locale==="nl"?"Bedrijf":locale==="en"?"Company":locale==="de"?"Unternehmen":locale==="fr"?"Entreprise":locale==="it"?"Azienda":"Empresa"}</strong><div className="lc-footer-column"><a href={"/"+locale+"/about"}>{t.aboutTitle}</a><a href={"/"+locale+"#contact"}>{locale==="nl"?"Contact":locale==="de"?"Kontakt":locale==="it"?"Contatti":"Contact"}</a><a href={"/"+locale+"/privacy"}>{t.privacyTitle}</a><a href={"/"+locale+"/terms"}>{t.termsTitle}</a><a href={"/"+locale+"/cookies"}>{t.cookiesTitle}</a></div></div>
      </div>
      <div className="lc-container lc-footer-bottom"><span>© 2026 RankFix AI. {locale==="nl"?"Alle rechten voorbehouden.":locale==="en"?"All rights reserved.":locale==="de"?"Alle Rechte vorbehalten.":locale==="fr"?"Tous droits réservés.":locale==="it"?"Tutti i diritti riservati.":"Todos los derechos reservados."}</span><span>SEO · GEO · AI Search · Built independent</span></div>
    </footer>
    <AiAssistant publicLocale={locale} />
    <MobileNav locale={locale} page={page} />
  </main>;
}
