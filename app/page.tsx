"use client";
import Link from "next/link";
import WebsiteProfile from "@/components/website-profile";

import { useEffect, useMemo, useState } from "react";
import AiAssistant from "@/components/ai-assistant";
import RootMobileNav from "./root-mobile-nav";
import PublicReviews from "@/components/public-reviews";
import "./root-mobile-nav.css";

type Check = {
  key: string;
  category: "seo" | "geo";
  title: string;
  status: "pass" | "warning" | "fail" | "not_applicable" | "unable_to_confirm";
  message: string;
  fix: string;
  points: number;
  maxPoints: number;
  issue_id?: string;
  rule_id?: string;
  fix_status?: "WAITING" | "DONE";
  issue_status?: string;
  severity?: string;
  confidence?: string;
  evidence?: { url: string; found: unknown; details: string };
  fix_category?: "A" | "B" | "C";
};

type ScanResult = {
  mode: "seo" | "geo" | "both";
  scannedUrl: string;
  finalUrl: string;
  overallScore: number;
  grade: string;
  responseTime: number;
  httpStatus: number;
  summary?: {passed:number;issues:number;notApplicable:number;unableToConfirm:number;pendingFixes:number};
  rendering?: {mode:string;javascriptExecuted:boolean;note:string};
  pageTypeEvidence?: {type:string;confidence:string;evidence:string[]};
  technologyProfile?: {siteType?:"Webshop"|"Landingpage"|"Website";cms:string|null;commercePlatform:string|null;framework:string|null;isCommerce:boolean;confidence:number;confidenceLabel:"high"|"medium"|"low";evidence:string[]};
  sectorProfile?: {sector?:string;key?:string;label:string;confidence:"high"|"medium"|"low";confidenceScore?:number;evidence:string[];applicableModules:string[]};
  seo: { score: number; grade: string; checks: Check[] };
  geo: { score: number; grade: string; checks: Check[] };
  metrics: {
    title: string;
    titleLength: number;
    description: string;
    descriptionLength: number;
    h1Count: number;
    h1s: string[];
    imageCount: number;
    imagesMissingAlt: number;
    wordCount: number;
    headingsCount: number;
    linksCount: number;
    internalLinks: number;
    canonical: string | null;
    lang: string | null;
    robots: string | null;
    openGraph: { title: string | null; description: string | null; image: string | null };
    imageAltCandidates?: { src: string }[];
    twitterCard: string | null;
    schemaTypes: string[];
    jsonLdBlocks: number;
    sitemapFound: boolean;
    robotsMentionsSitemap: boolean;
    recommendedSchema?: string;
    localBusinessDetails?: { name?: string | null; streetAddress?: string | null; postalCode?: string | null; addressLocality?: string | null; telephone?: string | null; email?: string | null; url?: string | null } | null;
  };
};

const statusIcon = { pass: "✓", warning: "!", fail: "×", not_applicable: "—", unable_to_confirm: "?" };

const workflowCopy = {
  nl:{scanning:"Scannen...",analyzing:"Website analyseren",checking:"We zijn je website aan het controleren",preparing:"RankFix bereidt een codewijziging voor",liveSafe:"De live website verandert nog niet",collecting:"We verzamelen je auditgegevens…",validating:"RankFix controleert de juiste wijziging…",staging:"RankFix zet de verbetering veilig klaar…",almost:"Klaar — bijna daar!",already:"Al in orde",alreadyTitle:"Deze verbetering was al aanwezig.",alreadyText:"RankFix heeft gecontroleerd of er echt iets moest worden aangepast. Dat was niet nodig.",nothing:"Je hoeft niets te doen.",noChange:"Er is geen technische wijziging aangemaakt.",backResult:"Ga terug naar mijn resultaat",proposal:"Codevoorstel aangemaakt",proposalTitle:"De wijziging staat klaar voor controle.",proposalText:"RankFix heeft een bestand gewijzigd in een aparte GitHub-pull-request. De live website is nog niet aangepast.",publish:"Controleer en publiceer de wijziging.",publishText:"Bekijk de diff, merge de pull request en scan je website opnieuw om de verbetering te bevestigen.",viewPr:"Bekijk pull request ↗",stopped:"Scan gestopt",liveAudit:"Live audit"},
  en:{scanning:"Scanning...",analyzing:"Analyzing website",checking:"We are checking your website",preparing:"RankFix is preparing a code change",liveSafe:"Your live website is not changing yet",collecting:"Collecting your audit data…",validating:"RankFix is validating the correct change…",staging:"RankFix is preparing the improvement safely…",almost:"Ready — almost there!",already:"Already correct",alreadyTitle:"This improvement was already present.",alreadyText:"RankFix checked whether a change was actually needed. It was not.",nothing:"You do not need to do anything.",noChange:"No technical change was created.",backResult:"Back to my result",proposal:"Code proposal created",proposalTitle:"The change is ready for review.",proposalText:"RankFix changed a file in a separate GitHub pull request. Your live website has not been changed yet.",publish:"Review and publish the change.",publishText:"Review the diff, merge the pull request and scan your website again to verify the improvement.",viewPr:"View pull request ↗",stopped:"Scan stopped",liveAudit:"Live audit"},
  de:{scanning:"Scan läuft...",analyzing:"Website wird analysiert",checking:"Wir prüfen deine Website",preparing:"RankFix bereitet eine Codeänderung vor",liveSafe:"Die Live-Website wird noch nicht geändert",collecting:"Auditdaten werden gesammelt…",validating:"RankFix prüft die richtige Änderung…",staging:"RankFix bereitet die Verbesserung sicher vor…",almost:"Fertig — fast geschafft!",already:"Bereits in Ordnung",alreadyTitle:"Diese Verbesserung war bereits vorhanden.",alreadyText:"RankFix hat geprüft, ob wirklich eine Änderung nötig war. Das war nicht der Fall.",nothing:"Du musst nichts tun.",noChange:"Es wurde keine technische Änderung erstellt.",backResult:"Zurück zu meinem Ergebnis",proposal:"Codevorschlag erstellt",proposalTitle:"Die Änderung ist zur Prüfung bereit.",proposalText:"RankFix hat eine Datei in einem separaten GitHub-Pull-Request geändert. Die Live-Website wurde noch nicht angepasst.",publish:"Änderung prüfen und veröffentlichen.",publishText:"Prüfe den Diff, merge den Pull Request und scanne die Website erneut, um die Verbesserung zu bestätigen.",viewPr:"Pull Request ansehen ↗",stopped:"Scan gestoppt",liveAudit:"Live-Audit"},
  fr:{scanning:"Analyse...",analyzing:"Analyse du site",checking:"Nous vérifions votre site",preparing:"RankFix prépare une modification du code",liveSafe:"Le site en production n’est pas encore modifié",collecting:"Collecte des données d’audit…",validating:"RankFix vérifie la modification appropriée…",staging:"RankFix prépare l’amélioration en toute sécurité…",almost:"Prêt — presque terminé !",already:"Déjà correct",alreadyTitle:"Cette amélioration était déjà présente.",alreadyText:"RankFix a vérifié si une modification était réellement nécessaire. Ce n’était pas le cas.",nothing:"Vous n’avez rien à faire.",noChange:"Aucune modification technique n’a été créée.",backResult:"Retour à mon résultat",proposal:"Proposition de code créée",proposalTitle:"La modification est prête à être vérifiée.",proposalText:"RankFix a modifié un fichier dans une pull request GitHub distincte. Le site en production n’a pas encore été modifié.",publish:"Vérifiez et publiez la modification.",publishText:"Vérifiez le diff, fusionnez la pull request puis analysez à nouveau le site pour confirmer l’amélioration.",viewPr:"Voir la pull request ↗",stopped:"Analyse arrêtée",liveAudit:"Audit en direct"},
  it:{scanning:"Scansione...",analyzing:"Analisi del sito",checking:"Stiamo controllando il tuo sito",preparing:"RankFix sta preparando una modifica al codice",liveSafe:"Il sito live non viene ancora modificato",collecting:"Raccolta dei dati dell’audit…",validating:"RankFix verifica la modifica corretta…",staging:"RankFix prepara la correzione in sicurezza…",almost:"Pronto — ci siamo quasi!",already:"Già corretto",alreadyTitle:"Questo miglioramento era già presente.",alreadyText:"RankFix ha verificato se fosse davvero necessaria una modifica. Non lo era.",nothing:"Non devi fare nulla.",noChange:"Non è stata creata alcuna modifica tecnica.",backResult:"Torna al mio risultato",proposal:"Proposta di codice creata",proposalTitle:"La modifica è pronta per la verifica.",proposalText:"RankFix ha modificato un file in una pull request GitHub separata. Il sito live non è stato ancora modificato.",publish:"Verifica e pubblica la modifica.",publishText:"Controlla il diff, unisci la pull request e scansiona di nuovo il sito per confermare il miglioramento.",viewPr:"Visualizza pull request ↗",stopped:"Scansione interrotta",liveAudit:"Audit live"},
  es:{scanning:"Escaneando...",analyzing:"Analizando el sitio",checking:"Estamos comprobando tu sitio",preparing:"RankFix está preparando un cambio de código",liveSafe:"El sitio en producción aún no cambia",collecting:"Recopilando los datos de la auditoría…",validating:"RankFix comprueba el cambio correcto…",staging:"RankFix prepara la mejora de forma segura…",almost:"Listo — ¡ya casi está!",already:"Ya está correcto",alreadyTitle:"Esta mejora ya estaba presente.",alreadyText:"RankFix comprobó si realmente era necesario hacer un cambio. No lo era.",nothing:"No tienes que hacer nada.",noChange:"No se creó ningún cambio técnico.",backResult:"Volver a mi resultado",proposal:"Propuesta de código creada",proposalTitle:"El cambio está listo para revisión.",proposalText:"RankFix modificó un archivo en una pull request de GitHub separada. El sitio en producción todavía no se ha modificado.",publish:"Revisa y publica el cambio.",publishText:"Revisa el diff, fusiona la pull request y vuelve a escanear el sitio para confirmar la mejora.",viewPr:"Ver pull request ↗",stopped:"Escaneo detenido",liveAudit:"Auditoría en vivo"}
} as const;

const translations = {
  nl: {
    moreInfo:"Zo werkt het", audit:"Gratis scan", pricing:"Prijzen", resources:"Resources", contact:"Contact", login:"Inloggen", register:"Account aanmaken",
    badge:"SEO + GEO audit voor Google & AI Search", hero:"Vind wat je rankings blokkeert.", hero2:"Fix het met RankFix.",
    intro:"Eén snelle scan voor technische SEO, content, structured data en AI-search readiness. Eerst inzicht. Daarna concrete fixes — met AI wanneer jij dat activeert.",
    seoDesc:"Google & organische vindbaarheid", geoDesc:"AI Search & generatieve vindbaarheid", bothDesc:"Volledige analyse",
    start:"Gratis", auditStart:"audit starten →", scanning:"Scan wordt uitgevoerd…", noCard:"Geen creditcard", direct:"Direct rapport", both:"SEO + GEO",
    about:"Over RankFix", forWho:"Voor wie", company:"Bedrijf", product:"Product", language:"Taal",
    contactTitle:"Neem contact op.", contactText:"Vraag over RankFix, een samenwerking of hulp nodig? Stuur ons een bericht.",
    send:"Bericht versturen →", sending:"Verzenden…", thanks:"Bedankt! Je bericht is verzonden.",
    back:"← Terug naar RankFix AI"
  },
  en: {
    moreInfo:"How it works", audit:"Free scan", pricing:"Pricing", resources:"Resources", contact:"Contact", login:"Log in", register:"Create account",
    badge:"SEO + GEO audit for Google & AI Search", hero:"Find what is blocking your rankings.", hero2:"Fix it with RankFix.",
    intro:"One fast scan for technical SEO, content, structured data and AI-search readiness. Get insight first, then concrete fixes — with AI when you activate it.",
    seoDesc:"Google & organic visibility", geoDesc:"AI Search & generative visibility", bothDesc:"Full analysis",
    start:"Free", auditStart:"audit →", scanning:"Scan in progress…", noCard:"No credit card", direct:"Instant report", both:"SEO + GEO",
    about:"About RankFix", forWho:"Who it's for", company:"Company", product:"Product", language:"Language",
    contactTitle:"Get in touch.", contactText:"Questions about RankFix, a partnership or need help? Send us a message.",
    send:"Send message →", sending:"Sending…", thanks:"Thanks! Your message was sent.", back:"← Back to RankFix AI"
  },
  fr: {
    moreInfo:"Comment ça marche", audit:"Audit gratuit", pricing:"Tarifs", resources:"Ressources", contact:"Contact", login:"Connexion", register:"Créer un compte",
    badge:"Audit SEO + GEO pour Google & AI Search", hero:"Trouvez ce qui bloque vos performances.", hero2:"Corrigez-le avec RankFix.",
    intro:"Un scan rapide du SEO technique, du contenu, des données structurées et de la visibilité dans l'IA. Analysez d'abord, corrigez ensuite.",
    seoDesc:"Google & visibilité organique", geoDesc:"AI Search & visibilité générative", bothDesc:"Analyse complète",
    start:"Audit", auditStart:"gratuit →", scanning:"Analyse en cours…", noCard:"Sans carte bancaire", direct:"Rapport immédiat", both:"SEO + GEO",
    about:"À propos de RankFix", forWho:"Pour qui", company:"Entreprise", product:"Produit", language:"Langue",
    contactTitle:"Contactez-nous.", contactText:"Une question sur RankFix, un partenariat ou besoin d'aide ? Envoyez-nous un message.",
    send:"Envoyer le message →", sending:"Envoi…", thanks:"Merci ! Votre message a été envoyé.", back:"← Retour à RankFix AI"
  },
  de: {
    moreInfo:"So funktioniert’s", audit:"Kostenloser Scan", pricing:"Preise", resources:"Ressourcen", contact:"Kontakt", login:"Anmelden", register:"Konto erstellen",
    badge:"SEO + GEO Audit für Google & AI Search", hero:"Finde, was deine Rankings blockiert.", hero2:"Behebe es mit RankFix.",
    intro:"Ein schneller Scan für technisches SEO, Inhalte, strukturierte Daten und AI-Search-Bereitschaft. Erst analysieren, dann konkrete Fixes umsetzen.",
    seoDesc:"Google & organische Sichtbarkeit", geoDesc:"AI Search & generative Sichtbarkeit", bothDesc:"Vollständige Analyse",
    start:"Kostenlosen", auditStart:"Scan starten →", scanning:"Scan läuft…", noCard:"Keine Kreditkarte", direct:"Direkter Bericht", both:"SEO + GEO",
    about:"Über RankFix", forWho:"Für wen", company:"Unternehmen", product:"Produkt", language:"Sprache",
    contactTitle:"Kontakt aufnehmen.", contactText:"Fragen zu RankFix, eine Zusammenarbeit oder Hilfe nötig? Schreib uns.",
    send:"Nachricht senden →", sending:"Senden…", thanks:"Danke! Deine Nachricht wurde gesendet.", back:"← Zurück zu RankFix AI"
  },
  it: {
    moreInfo:"Come funziona", audit:"Analisi gratuita", pricing:"Prezzi", resources:"Risorse", contact:"Contatti", login:"Accedi", register:"Crea account",
    badge:"Audit SEO + GEO per Google & AI Search", hero:"Scopri cosa blocca il tuo ranking.", hero2:"Risolvilo con RankFix.",
    intro:"Una scansione rapida per SEO tecnico, contenuti, dati strutturati e visibilità nell'AI. Prima l'analisi, poi fix concreti.",
    seoDesc:"Google & visibilità organica", geoDesc:"AI Search & visibilità generativa", bothDesc:"Analisi completa",
    start:"Audit", auditStart:"gratuito →", scanning:"Scansione in corso…", noCard:"Nessuna carta", direct:"Report immediato", both:"SEO + GEO",
    about:"Chi è RankFix", forWho:"Per chi", company:"Azienda", product:"Prodotto", language:"Lingua",
    contactTitle:"Contattaci.", contactText:"Domande su RankFix, partnership o bisogno di aiuto? Inviaci un messaggio.",
    send:"Invia messaggio →", sending:"Invio…", thanks:"Grazie! Il messaggio è stato inviato.", back:"← Torna a RankFix AI"
  },
  es: {
    moreInfo:"Cómo funciona", audit:"Análisis gratis", pricing:"Precios", resources:"Recursos", contact:"Contacto", login:"Iniciar sesión", register:"Crear cuenta",
    badge:"Auditoría SEO + GEO para Google & AI Search", hero:"Descubre qué bloquea tus rankings.", hero2:"Arréglalo con RankFix.",
    intro:"Un escaneo rápido de SEO técnico, contenido, datos estructurados y preparación para búsquedas con IA. Primero analiza, después corrige.",
    seoDesc:"Google & visibilidad orgánica", geoDesc:"AI Search & visibilidad generativa", bothDesc:"Análisis completo",
    start:"Auditoría SEO + GEO", auditStart:"gratis →", scanning:"Escaneo en curso…", noCard:"Sin tarjeta", direct:"Informe directo", both:"SEO + GEO",
    about:"Sobre RankFix", forWho:"Para quién", company:"Empresa", product:"Producto", language:"Idioma",
    contactTitle:"Contacta con nosotros.", contactText:"¿Preguntas sobre RankFix, colaboración o necesitas ayuda? Envíanos un mensaje.",
    send:"Enviar mensaje →", sending:"Enviando…", thanks:"¡Gracias! Tu mensaje ha sido enviado.", back:"← Volver a RankFix AI"
  }
} as const;


const sectionCopy = {
 nl:{fixLabel:"Eerlijke fixes",fixTitle:"Geen ‘fix klaar’ als er niets is veranderd.",fixIntro:"Elke technische fix wordt gevonden, gecontroleerd, echt gewijzigd en opnieuw gecontroleerd.",audiences:[["Websites","SEO & GEO audits voor publieke webpagina's."],["Webshops","Product-, categorie- en conversiesignalen."],["Apps","Publieke app-landingspagina's en store-content."],["Agencies","Klantprojecten, rapporten en white-label workflows."]],resources:[["SEO Audit","Technische en on-page signalen."],["GEO Audit","Structured data en AI-search signalen."],["Webshop Audit","Productdata, prijzen, trust en e-commerce signalen."],["Ads Readiness","Landingspagina, tracking en conversiesignalen voor Google Ads."],["Local SEO","LocalBusiness, locaties, openingstijden en officiële profielen."]]},
 en:{fixLabel:"Transparent fixes",fixTitle:"No ‘fix complete’ when nothing changed.",fixIntro:"Every technical fix is found, reviewed, actually changed and checked again.",audiences:[["Websites","SEO & GEO audits for public web pages."],["Online stores","Product, category and conversion signals."],["Apps","Public app landing pages and store content."],["Agencies","Client projects, reports and white-label workflows."]],resources:[["SEO Audit","Technical and on-page signals."],["GEO Audit","Structured data and AI-search signals."],["E-commerce Audit","Product data, prices, trust and e-commerce signals."],["Ads Readiness","Landing pages, tracking and Google Ads conversion signals."],["Local SEO","LocalBusiness, locations, opening hours and official profiles."]]},
 fr:{fixLabel:"Correctifs transparents",fixTitle:"Pas de « correctif terminé » si rien n’a changé.",fixIntro:"Chaque correctif est détecté, vérifié, réellement modifié puis revérifié.",audiences:[["Sites web","Audits SEO & GEO pour les pages publiques."],["Boutiques en ligne","Signaux produit, catégorie et conversion."],["Applications","Pages publiques d’app et contenu des stores."],["Agences","Projets clients, rapports et workflows en marque blanche."]],resources:[["Audit SEO","Signaux techniques et on-page."],["Audit GEO","Données structurées et signaux de recherche IA."],["Audit e-commerce","Données produit, prix, confiance et signaux e-commerce."],["Préparation Ads","Pages de destination, suivi et conversions Google Ads."],["SEO local","LocalBusiness, lieux, horaires et profils officiels."]]},
 de:{fixLabel:"Transparente Fixes",fixTitle:"Kein „Fix fertig“, wenn nichts geändert wurde.",fixIntro:"Jeder technische Fix wird gefunden, geprüft, wirklich geändert und erneut geprüft.",audiences:[["Websites","SEO- & GEO-Audits für öffentliche Webseiten."],["Onlineshops","Produkt-, Kategorie- und Conversion-Signale."],["Apps","Öffentliche App-Landingpages und Store-Inhalte."],["Agenturen","Kundenprojekte, Berichte und White-Label-Workflows."]],resources:[["SEO Audit","Technische und On-Page-Signale."],["GEO Audit","Strukturierte Daten und AI-Search-Signale."],["Shop Audit","Produktdaten, Preise, Vertrauen und E-Commerce-Signale."],["Ads Readiness","Landingpages, Tracking und Google-Ads-Conversions."],["Local SEO","LocalBusiness, Standorte, Öffnungszeiten und offizielle Profile."]]},
 it:{fixLabel:"Fix trasparenti",fixTitle:"Nessun ‘fix completato’ se non è cambiato nulla.",fixIntro:"Ogni fix viene rilevato, verificato, realmente modificato e controllato di nuovo.",audiences:[["Siti web","Audit SEO & GEO per pagine pubbliche."],["E-commerce","Segnali di prodotto, categoria e conversione."],["App","Landing page pubbliche e contenuti store."],["Agenzie","Progetti clienti, report e workflow white-label."]],resources:[["Audit SEO","Segnali tecnici e on-page."],["Audit GEO","Dati strutturati e segnali AI-search."],["Audit e-commerce","Dati prodotto, prezzi, fiducia e segnali e-commerce."],["Ads Readiness","Landing page, tracking e conversioni Google Ads."],["SEO locale","LocalBusiness, sedi, orari e profili ufficiali."]]},
 es:{fixLabel:"Mejoras transparentes",fixTitle:"No hay «mejora completada» si nada ha cambiado.",fixIntro:"Cada mejora se detecta, revisa, modifica realmente y se comprueba de nuevo.",audiences:[["Sitios web","Auditorías SEO & GEO para páginas públicas."],["Tiendas online","Señales de producto, categoría y conversión."],["Apps","Landing pages públicas y contenido de stores."],["Agencias","Proyectos de clientes, informes y workflows white-label."]],resources:[["Auditoría SEO","Señales técnicas y on-page."],["Auditoría GEO","Datos estructurados y señales de búsqueda con IA."],["Auditoría e-commerce","Datos de producto, precios, confianza y señales e-commerce."],["Ads Readiness","Landing pages, tracking y conversiones Google Ads."],["SEO local","LocalBusiness, ubicaciones, horarios y perfiles oficiales."]]}
} as const;

const auditResultCopy = {
  nl:{opportunities:"Jouw kansen, op één scherm.",result:"Jouw RankFix resultaat",resultTitle:"Dit is wat er met je website gebeurt.",resultIntro:"Bekijk wat al goed is, wat nog aandacht vraagt en welke codevoorstellen nog live bevestigd moeten worden. Een fix is pas bevestigd na een nieuwe scan van je live website.",found:"gevonden",improvement:"verbeterpunt",improvements:"verbeterpunten",done:"Gedaan",doneText:"Controles die al goed staan.",todo:"Nog te verbeteren",todoText:"Punten waarvoor nog geen wijziging is klaargezet.",proposal:"Codevoorstel",proposalText:"Pull requests die nog niet live bevestigd zijn.",confirm:"Nog te bevestigen",confirmText:"Controleer, publiceer en scan opnieuw.",openIssue:"Open een verbeterpunt hieronder voor uitleg en een voorstel.",checkPr:"Controleer de pull request, publiceer en scan daarna opnieuw.",allGood:"De getoonde controles zijn in orde.",next:"Volgende stap",ready:"Klaar",coverage:"Dekking",coverageInfo:"Alleen bewezen en toepasselijke controles tellen mee in de score. N.v.t. en niet te bevestigen blijven apart.",assessed:"controles beoordeeld",passed:"geslaagd",naOrUnknown:"N.v.t. of niet te bevestigen",checks:"controles",more:"meer",technical:"Bekijk technische details",na:"N.v.t.",unknown:"Niet te bevestigen",recommendation:"RankFix aanbeveling",fixProposal:"✨ Maak fixvoorstel",analyzing:"AI analyseert…",metrics:"Kernmetrics",words:"Woorden",images:"Afbeeldingen",internalLinks:"Interne links",action:"AI-actielaag",review:"om te bekijken",actionInfo:"Bekijk per verbeterpunt of RankFix een concreet fixvoorstel kan maken. Een voorstel wijzigt je live website niet; scan opnieuw na het publiceren om het resultaat te controleren."},
  en:{opportunities:"Your opportunities, at a glance.",result:"Your RankFix result",resultTitle:"This is what is happening with your website.",resultIntro:"See what is already working, what still needs attention and which code proposals are awaiting verification. A fix is only confirmed after a new scan of your live website.",found:"found",improvement:"improvement",improvements:"improvements",done:"Done",doneText:"Checks that are already correct.",todo:"Needs improvement",todoText:"Items for which no change has been prepared yet.",proposal:"Code proposal",proposalText:"Pull requests not yet verified live.",confirm:"Pending verification",confirmText:"Review, publish and scan again.",openIssue:"Open an improvement below for an explanation and proposal.",checkPr:"Review the pull request, publish it and scan again.",allGood:"The displayed checks are correct.",next:"Next step",ready:"Ready",coverage:"Coverage",coverageInfo:"Audit coverage shows how many checks could actually be assessed. N/A and unable to confirm do not count toward the score.",assessed:"checks assessed",passed:"passed",naOrUnknown:"N/A or unable to confirm",checks:"checks",more:"more",technical:"View technical details",na:"N/A",unknown:"Unable to confirm",recommendation:"RankFix recommendation",fixProposal:"✨ Create fix proposal",analyzing:"AI is analyzing…",metrics:"Core metrics",words:"Words",images:"Images",internalLinks:"Internal links",action:"AI action layer",review:"to review",actionInfo:"Review each improvement to see whether RankFix can create a concrete fix proposal. A proposal does not change your live website; scan again after publishing to verify the result."},
  de:{opportunities:"Deine Chancen auf einen Blick.",result:"Dein RankFix-Ergebnis",resultTitle:"Das passiert mit deiner Website.",resultIntro:"Sieh, was bereits gut funktioniert, was noch Aufmerksamkeit braucht und welche Codevorschläge auf Bestätigung warten. Ein Fix gilt erst nach einem neuen Live-Scan als bestätigt.",found:"gefunden",improvement:"Verbesserung",improvements:"Verbesserungen",done:"Erledigt",doneText:"Prüfungen, die bereits in Ordnung sind.",todo:"Noch zu verbessern",todoText:"Punkte, für die noch keine Änderung vorbereitet wurde.",proposal:"Codevorschlag",proposalText:"Pull Requests, die live noch nicht bestätigt sind.",confirm:"Noch zu bestätigen",confirmText:"Prüfen, veröffentlichen und erneut scannen.",openIssue:"Öffne unten einen Verbesserungspunkt für Erklärung und Vorschlag.",checkPr:"Prüfe den Pull Request, veröffentliche ihn und scanne erneut.",allGood:"Die angezeigten Prüfungen sind in Ordnung.",next:"Nächster Schritt",ready:"Fertig",coverage:"Abdeckung",coverageInfo:"Die Audit-Abdeckung zeigt, wie viele Prüfungen tatsächlich bewertet werden konnten. N. a. und nicht bestätigbar zählen nicht zur Punktzahl.",assessed:"Prüfungen bewertet",passed:"bestanden",naOrUnknown:"N. a. oder nicht bestätigbar",checks:"Prüfungen",more:"mehr",technical:"Technische Details ansehen",na:"N. a.",unknown:"Nicht bestätigbar",recommendation:"RankFix-Empfehlung",fixProposal:"✨ Fix-Vorschlag erstellen",analyzing:"KI analysiert…",metrics:"Kernmetriken",words:"Wörter",images:"Bilder",internalLinks:"Interne Links",action:"KI-Aktionsebene",review:"zu prüfen",actionInfo:"Prüfe jeden Verbesserungspunkt, um zu sehen, ob RankFix einen konkreten Fix-Vorschlag erstellen kann. Ein Vorschlag ändert deine Live-Website nicht; scanne nach der Veröffentlichung erneut, um das Ergebnis zu prüfen."},
  fr:{opportunities:"Vos opportunités, en un coup d’œil.",result:"Votre résultat RankFix",resultTitle:"Voici ce qui se passe sur votre site.",resultIntro:"Voyez ce qui fonctionne déjà, ce qui demande encore votre attention et quelles propositions de code attendent une vérification. Un correctif n’est confirmé qu’après une nouvelle analyse du site en ligne.",found:"trouvés",improvement:"amélioration",improvements:"améliorations",done:"Terminé",doneText:"Contrôles déjà conformes.",todo:"À améliorer",todoText:"Points pour lesquels aucune modification n’a encore été préparée.",proposal:"Proposition de code",proposalText:"Pull requests pas encore vérifiées en ligne.",confirm:"À confirmer",confirmText:"Vérifiez, publiez et relancez l’analyse.",openIssue:"Ouvrez une amélioration ci-dessous pour voir l’explication et une proposition.",checkPr:"Vérifiez la pull request, publiez-la puis relancez l’analyse.",allGood:"Les contrôles affichés sont conformes.",next:"Étape suivante",ready:"Prêt",coverage:"Couverture",coverageInfo:"La couverture indique combien de contrôles ont réellement pu être évalués. Les éléments non applicables ou impossibles à confirmer ne comptent pas dans le score.",assessed:"contrôles évalués",passed:"réussis",naOrUnknown:"N/A ou impossibles à confirmer",checks:"contrôles",more:"de plus",technical:"Voir les détails techniques",na:"N/A",unknown:"Impossible à confirmer",recommendation:"Recommandation RankFix",fixProposal:"✨ Créer une proposition de correctif",analyzing:"L’IA analyse…",metrics:"Indicateurs clés",words:"Mots",images:"Images",internalLinks:"Liens internes",action:"Couche d’action IA",review:"à examiner",actionInfo:"Examinez chaque amélioration pour voir si RankFix peut créer une proposition de correctif concrète. Une proposition ne modifie pas votre site en ligne ; relancez une analyse après publication pour vérifier le résultat."},
  it:{opportunities:"Le tue opportunità, a colpo d’occhio.",result:"Il tuo risultato RankFix",resultTitle:"Ecco cosa sta succedendo al tuo sito.",resultIntro:"Scopri cosa funziona già, cosa richiede attenzione e quali proposte di codice attendono verifica. Un fix è confermato solo dopo una nuova scansione del sito online.",found:"trovati",improvement:"miglioria",improvements:"migliorie",done:"Fatto",doneText:"Controlli già corretti.",todo:"Da migliorare",todoText:"Punti per cui non è ancora stata preparata una modifica.",proposal:"Proposta di codice",proposalText:"Pull request non ancora verificate online.",confirm:"Da confermare",confirmText:"Controlla, pubblica e scansiona di nuovo.",openIssue:"Apri una miglioria qui sotto per spiegazione e proposta.",checkPr:"Controlla la pull request, pubblicala e scansiona di nuovo.",allGood:"I controlli mostrati sono corretti.",next:"Passo successivo",ready:"Pronto",coverage:"Copertura",coverageInfo:"La copertura mostra quanti controlli sono stati effettivamente valutati. N/D e non confermabili non contano nel punteggio.",assessed:"controlli valutati",passed:"superati",naOrUnknown:"N/D o non confermabili",checks:"controlli",more:"in più",technical:"Vedi dettagli tecnici",na:"N/D",unknown:"Non confermabile",recommendation:"Raccomandazione RankFix",fixProposal:"✨ Crea proposta di fix",analyzing:"L’AI sta analizzando…",metrics:"Metriche principali",words:"Parole",images:"Immagini",internalLinks:"Link interni",action:"Livello azioni AI",review:"da esaminare",actionInfo:"Controlla ogni miglioramento per vedere se RankFix può creare una proposta di correzione concreta. Una proposta non modifica il sito online; esegui una nuova scansione dopo la pubblicazione per verificare il risultato."},
  es:{opportunities:"Tus oportunidades, de un vistazo.",result:"Tu resultado RankFix",resultTitle:"Esto es lo que ocurre con tu sitio web.",resultIntro:"Consulta qué funciona bien, qué necesita atención y qué propuestas de código esperan verificación. Una corrección solo se confirma tras un nuevo análisis del sitio publicado.",found:"encontrados",improvement:"mejora",improvements:"mejoras",done:"Hecho",doneText:"Comprobaciones que ya están correctas.",todo:"Por mejorar",todoText:"Puntos para los que aún no se ha preparado un cambio.",proposal:"Propuesta de código",proposalText:"Pull requests aún no verificadas en vivo.",confirm:"Por confirmar",confirmText:"Revisa, publica y vuelve a analizar.",openIssue:"Abre una mejora abajo para ver la explicación y una propuesta.",checkPr:"Revisa la pull request, publícala y vuelve a analizar.",allGood:"Las comprobaciones mostradas son correctas.",next:"Siguiente paso",ready:"Listo",coverage:"Cobertura",coverageInfo:"La cobertura muestra cuántas comprobaciones pudieron evaluarse realmente. N/A y no confirmables no cuentan en la puntuación.",assessed:"comprobaciones evaluadas",passed:"correctas",naOrUnknown:"N/A o no confirmables",checks:"comprobaciones",more:"más",technical:"Ver detalles técnicos",na:"N/A",unknown:"No se puede confirmar",recommendation:"Recomendación RankFix",fixProposal:"✨ Crear propuesta de corrección",analyzing:"La IA está analizando…",metrics:"Métricas principales",words:"Palabras",images:"Imágenes",internalLinks:"Enlaces internos",action:"Capa de acción IA",review:"para revisar",actionInfo:"Revisa cada mejora para ver si RankFix puede crear una propuesta de corrección concreta. Una propuesta no modifica tu web publicada; vuelve a analizarla después de publicar para verificar el resultado."}
} as const;

const publicCopy = {
  nl:{featuresEyebrow:"Van inzicht naar verbetering",featuresTitle:"Van scan naar actie.",featuresIntro:"Ontdek wat aandacht vraagt, lees waarom het telt en bekijk een concreet codevoorstel. Na publicatie bevestig je de verandering met een nieuwe scan.",cards:[["SEO + GEO audit","Technische SEO, metadata, structured data, entities, social metadata, URL-hygiëne en AI-search signalen."],["Webshop audit","Product-schema, prijsnotatie, retour- en verzendsignalen, reviewplatforms, checkout-trust en variant-URL's."],["Ads readiness","Controleer landingspagina, tracking-signalen, GA4/GTM en Google Ads-conversies."],["Fix Engine","RankFix maakt een aparte pull request voor een veilige codewijziging. Controleer en publiceer die eerst; scan daarna opnieuw."]],pricingLabel:"Eenvoudige prijzen",pricingTitle:"Duidelijke prijzen. Kies wat bij je past.",pricingIntro:"Kies het abonnement dat bij je website of webshop past. AI-fixes zijn inbegrepen in de betaalde pakketten.",perMonth:"per maand",trial:"voor kennismaken",chosen:"Meest gekozen",forStores:"Voor webshops",freeScan:"Gratis scan starten",choose:"Kies",resourcesTitle:"Alles om van audit naar actie te gaan.",resourcesIntro:"Gebruik RankFix voor audits en concrete codevoorstellen. Rapportdownloads en uitgebreidere lokale SEO-functies zijn nog in ontwikkeling.",aboutTitle:"Minder jargon. Meer grip op je website.",about1:"RankFix AI helpt ondernemers en teams om hun website beter te begrijpen. De scan bekijkt SEO- en GEO-signalen, van technische basis en inhoud tot structured data.",about2:"Voor geschikte codewijzigingen kan RankFix een aparte GitHub-pull-request voorbereiden. Je controleert en publiceert die zelf; een nieuwe scan bevestigt de verbetering.",learnMore:"Lees meer over RankFix →",name:"Naam",email:"E-mailadres",company:"Bedrijf (optioneel)",message:"Waar kunnen we mee helpen?",tech:"Techniek",store:"Webshop",concrete:"Concrete verbeteringen",ready:"Klaar voor klanten"},
  en:{featuresEyebrow:"From insight to improvement",featuresTitle:"From scan to action.",featuresIntro:"See what needs attention, understand why it matters and review a concrete code proposal. After publishing, confirm the change with a new scan.",cards:[["SEO + GEO audit","Technical SEO, metadata, structured data, entities, social metadata, URL hygiene and AI-search signals."],["E-commerce audit","Product schema, price notation, returns and shipping signals, review platforms, checkout trust and variant URLs."],["Ads readiness","Check landing pages, tracking signals, GA4/GTM and Google Ads conversions."],["Fix Engine","RankFix creates a separate pull request for a safe code change. Review and publish it first, then scan again."]],pricingLabel:"Simple pricing",pricingTitle:"Clear pricing. Choose what fits.",pricingIntro:"Choose the plan that fits your website or online store. AI fixes are included in paid plans.",perMonth:"per month",trial:"to get started",chosen:"Most popular",forStores:"For online stores",freeScan:"Start free scan",choose:"Choose",resourcesTitle:"Everything you need to move from audit to action.",resourcesIntro:"Use RankFix for audits and concrete code proposals. Report downloads and expanded local SEO features are still in development.",aboutTitle:"Less jargon. More control over your website.",about1:"RankFix AI helps businesses and teams understand their websites. The scan reviews SEO and GEO signals, from technical foundations and content to structured data.",about2:"For suitable code changes, RankFix can prepare a separate GitHub pull request. You review and publish it yourself; a new scan confirms the improvement.",learnMore:"Learn more about RankFix →",name:"Name",email:"Email address",company:"Company (optional)",message:"How can we help?",tech:"Technical",store:"E-commerce",concrete:"Concrete improvements",ready:"Client-ready"},
  fr:{featuresEyebrow:"De l’analyse à l’amélioration",featuresTitle:"Du scan à l’action.",featuresIntro:"Découvrez ce qui demande votre attention, comprenez pourquoi et consultez une proposition de code concrète. Après publication, confirmez le changement avec un nouveau scan.",cards:[["Audit SEO + GEO","SEO technique, métadonnées, données structurées, entités, métadonnées sociales, hygiène des URL et signaux de recherche IA."],["Audit e-commerce","Schéma produit, prix, retours et livraison, plateformes d’avis, confiance du paiement et URL de variantes."],["Préparation Ads","Contrôlez les pages de destination, les signaux de suivi, GA4/GTM et les conversions Google Ads."],["Fix Engine","RankFix crée une pull request séparée pour une modification sûre. Vérifiez-la et publiez-la, puis relancez le scan."]],pricingLabel:"Tarifs simples",pricingTitle:"Des tarifs clairs. Choisissez l’offre adaptée.",pricingIntro:"Choisissez l’offre adaptée à votre site ou boutique. Les correctifs IA sont inclus dans les offres payantes.",perMonth:"par mois",trial:"pour commencer",chosen:"Le plus populaire",forStores:"Pour les boutiques",freeScan:"Lancer le scan gratuit",choose:"Choisir",resourcesTitle:"Tout pour passer de l’audit à l’action.",resourcesIntro:"Utilisez RankFix pour les audits et les propositions de code concrètes. Les téléchargements de rapports et les fonctions SEO local avancées sont encore en développement.",aboutTitle:"Moins de jargon. Plus de contrôle sur votre site.",about1:"RankFix AI aide les entreprises et les équipes à mieux comprendre leur site. Le scan analyse les signaux SEO et GEO, de la base technique au contenu et aux données structurées.",about2:"Pour les modifications adaptées, RankFix peut préparer une pull request GitHub séparée. Vous la vérifiez et la publiez vous-même; un nouveau scan confirme l’amélioration.",learnMore:"En savoir plus sur RankFix →",name:"Nom",email:"Adresse e-mail",company:"Entreprise (facultatif)",message:"Comment pouvons-nous vous aider ?",tech:"Technique",store:"E-commerce",concrete:"Améliorations concrètes",ready:"Prêt pour les clients"},
  de:{featuresEyebrow:"Von der Analyse zur Verbesserung",featuresTitle:"Vom Scan zur Aktion.",featuresIntro:"Erkenne, was Aufmerksamkeit braucht, verstehe warum und prüfe einen konkreten Codevorschlag. Nach der Veröffentlichung bestätigst du die Änderung mit einem neuen Scan.",cards:[["SEO + GEO Audit","Technisches SEO, Metadaten, strukturierte Daten, Entitäten, Social Metadata, URL-Hygiene und AI-Search-Signale."],["Shop-Audit","Produktschema, Preisangaben, Rückgabe- und Versandsignale, Bewertungsplattformen, Checkout-Vertrauen und Varianten-URLs."],["Ads Readiness","Prüfe Landingpages, Tracking-Signale, GA4/GTM und Google-Ads-Conversions."],["Fix Engine","RankFix erstellt einen separaten Pull Request für eine sichere Codeänderung. Erst prüfen und veröffentlichen, danach erneut scannen."]],pricingLabel:"Einfache Preise",pricingTitle:"Faire Preise. Kein Schnickschnack.",pricingIntro:"Wähle den Tarif, der zu deiner Website oder deinem Shop passt. AI-Fixes sind in den bezahlten Tarifen enthalten.",perMonth:"pro Monat",trial:"zum Kennenlernen",chosen:"Am beliebtesten",forStores:"Für Shops",freeScan:"Kostenlosen Scan starten",choose:"Wählen",resourcesTitle:"Alles für den Weg vom Audit zur Umsetzung.",resourcesIntro:"Nutze RankFix für Audits und konkrete Codevorschläge. Berichtdownloads und erweiterte Local-SEO-Funktionen sind noch in Entwicklung.",aboutTitle:"Weniger Fachsprache. Mehr Kontrolle über deine Website.",about1:"RankFix AI hilft Unternehmen und Teams, ihre Website besser zu verstehen. Der Scan prüft SEO- und GEO-Signale von der technischen Basis bis zu Inhalten und strukturierten Daten.",about2:"Für geeignete Codeänderungen kann RankFix einen separaten GitHub Pull Request vorbereiten. Du prüfst und veröffentlichst ihn selbst; ein neuer Scan bestätigt die Verbesserung.",learnMore:"Mehr über RankFix →",name:"Name",email:"E-Mail-Adresse",company:"Unternehmen (optional)",message:"Wie können wir helfen?",tech:"Technik",store:"Webshop",concrete:"Konkrete Verbesserungen",ready:"Bereit für Kunden"},
  it:{featuresEyebrow:"Dall’analisi al miglioramento",featuresTitle:"Dalla scansione all’azione.",featuresIntro:"Scopri cosa richiede attenzione, capisci perché è importante e consulta una proposta di codice concreta. Dopo la pubblicazione, conferma la modifica con una nuova scansione.",cards:[["Audit SEO + GEO","SEO tecnico, metadati, dati strutturati, entità, metadati social, igiene URL e segnali di ricerca AI."],["Audit e-commerce","Schema prodotto, prezzi, resi e spedizioni, piattaforme di recensioni, fiducia nel checkout e URL delle varianti."],["Ads readiness","Controlla landing page, segnali di tracking, GA4/GTM e conversioni Google Ads."],["Fix Engine","RankFix crea una pull request separata per una modifica sicura. Controllala e pubblicala, poi esegui una nuova scansione."]],pricingLabel:"Prezzi semplici",pricingTitle:"Prezzi chiari. Scegli il piano più adatto.",pricingIntro:"Scegli il piano adatto al tuo sito o negozio online. I fix AI sono inclusi nei piani a pagamento.",perMonth:"al mese",trial:"per iniziare",chosen:"Più popolare",forStores:"Per e-commerce",freeScan:"Avvia scansione gratuita",choose:"Scegli",resourcesTitle:"Tutto per passare dall’audit all’azione.",resourcesIntro:"Usa RankFix per audit e proposte di codice concrete. Download dei report e funzioni SEO locale avanzate sono ancora in sviluppo.",aboutTitle:"Meno gergo. Più controllo sul tuo sito.",about1:"RankFix AI aiuta aziende e team a capire meglio il proprio sito. La scansione analizza segnali SEO e GEO, dalla base tecnica ai contenuti e ai dati strutturati.",about2:"Per modifiche adatte, RankFix può preparare una pull request GitHub separata. La controlli e pubblichi tu; una nuova scansione conferma il miglioramento.",learnMore:"Scopri di più su RankFix →",name:"Nome",email:"Indirizzo e-mail",company:"Azienda (opzionale)",message:"Come possiamo aiutarti?",tech:"Tecnica",store:"E-commerce",concrete:"Miglioramenti concreti",ready:"Pronto per i clienti"},
  es:{featuresEyebrow:"Del análisis a la mejora",featuresTitle:"Del escaneo a la acción.",featuresIntro:"Descubre qué necesita atención, entiende por qué importa y revisa una propuesta de código concreta. Tras publicarla, confirma el cambio con un nuevo escaneo.",cards:[["Auditoría SEO + GEO","SEO técnico, metadatos, datos estructurados, entidades, metadatos sociales, higiene de URL y señales de búsqueda con IA."],["Auditoría e-commerce","Schema de producto, precios, devoluciones y envíos, plataformas de reseñas, confianza del checkout y URL de variantes."],["Preparación Ads","Comprueba landing pages, señales de tracking, GA4/GTM y conversiones de Google Ads."],["Fix Engine","RankFix crea una pull request separada para un cambio seguro. Revísala y publícala primero; después vuelve a escanear."]],pricingLabel:"Precios simples",pricingTitle:"Precios claros. Elige el plan que mejor encaje.",pricingIntro:"Elige el plan adecuado para tu web o tienda. Los arreglos con IA están incluidos en los planes de pago.",perMonth:"al mes",trial:"para empezar",chosen:"Más elegido",forStores:"Para tiendas",freeScan:"Iniciar análisis gratis",choose:"Elegir",resourcesTitle:"Todo para pasar de la auditoría a la acción.",resourcesIntro:"Usa RankFix para auditorías y propuestas de código concretas. Las descargas de informes y las funciones avanzadas de SEO local siguen en desarrollo.",aboutTitle:"Menos jerga. Más control sobre tu web.",about1:"RankFix AI ayuda a empresas y equipos a entender mejor su web. El análisis revisa señales SEO y GEO, desde la base técnica y el contenido hasta los datos estructurados.",about2:"Para cambios adecuados, RankFix puede preparar una pull request de GitHub separada. Tú la revisas y publicas; un nuevo análisis confirma la mejora.",learnMore:"Más sobre RankFix →",name:"Nombre",email:"Correo electrónico",company:"Empresa (opcional)",message:"¿Cómo podemos ayudarte?",tech:"Técnica",store:"E-commerce",concrete:"Mejoras concretas",ready:"Listo para clientes"}
} as const;

const extraPublicCopy = {
 nl:{fairLabel:"Eerlijke fixes",fairTitle:"Geen “fix klaar” als er niets is veranderd.",fairIntro:"Elke technische fix doorloopt dezelfde keten: gevonden → gecontroleerd → echt gewijzigd → opnieuw gecontroleerd.",fair:[["🟠","Gevonden","RankFix legt in gewone taal uit wat er misgaat en waarom het telt."],["🔵","Codevoorstel","De wijziging staat in een aparte pull request, nog niet op de live website."],["🟡","Nog te bevestigen","Publiceer de codewijziging en scan de live website opnieuw."],["🟢","Bevestigd","De live scan laat zien dat de verbetering daadwerkelijk aanwezig is."]],audiences:[["Websites","SEO & GEO audits voor publieke webpagina's."],["Webshops","Product-, categorie- en conversiesignalen worden steeds verder uitgebreid."],["Apps","Publieke app-landingspagina's en store-content kunnen via dezelfde auditprincipes worden voorbereid."],["Agencies","Klantprojecten, rapporten en white-label workflows."]],resources:[["SEO Audit","Technische en on-page signalen."],["GEO Audit","Structured data en AI-search signalen."],["Webshop Audit","Productdata, prijzen, trust en e-commerce signalen."],["Ads Readiness","Landingspagina, tracking en conversiesignalen voor Google Ads."],["Local SEO","LocalBusiness, locaties, openingstijden en officiële profielen."]]},
 en:{fairLabel:"Verified fixes",fairTitle:"No “fix complete” when nothing changed.",fairIntro:"Every technical fix follows the same path: found → reviewed → actually changed → checked again.",fair:[["🟠","Found","RankFix explains in plain language what is wrong and why it matters."],["🔵","Code proposal","The change is in a separate pull request and is not live yet."],["🟡","Pending verification","Publish the code change and scan the live website again."],["🟢","Verified","The live scan confirms that the improvement is actually present."]],audiences:[["Websites","SEO & GEO audits for public web pages."],["Online stores","Product, category and conversion signals are continuously expanded."],["Apps","Public app landing pages and store content can use the same audit principles."],["Agencies","Client projects, reports and white-label workflows."]],resources:[["SEO Audit","Technical and on-page signals."],["GEO Audit","Structured data and AI-search signals."],["E-commerce Audit","Product data, prices, trust and e-commerce signals."],["Ads Readiness","Landing pages, tracking and conversion signals for Google Ads."],["Local SEO","LocalBusiness, locations, opening hours and official profiles."]]},
 fr:{fairLabel:"Correctifs vérifiés",fairTitle:"Pas de « correctif terminé » si rien n’a changé.",fairIntro:"Chaque correctif technique suit le même parcours : détecté → vérifié → réellement modifié → contrôlé à nouveau.",fair:[["🟠","Détecté","RankFix explique clairement le problème et pourquoi il compte."],["🔵","Proposition de code","La modification se trouve dans une pull request séparée et n’est pas encore en ligne."],["🟡","À confirmer","Publiez la modification puis relancez un scan du site en ligne."],["🟢","Confirmé","Le scan en ligne confirme que l’amélioration est réellement présente."]],audiences:[["Sites web","Audits SEO & GEO des pages web publiques."],["Boutiques en ligne","Les signaux produit, catégorie et conversion sont continuellement enrichis."],["Applications","Les pages publiques d’applications et contenus de store suivent les mêmes principes d’audit."],["Agences","Projets clients, rapports et workflows en marque blanche."]],resources:[["Audit SEO","Signaux techniques et on-page."],["Audit GEO","Données structurées et signaux de recherche IA."],["Audit e-commerce","Données produit, prix, confiance et signaux e-commerce."],["Préparation Ads","Pages de destination, suivi et signaux de conversion Google Ads."],["SEO local","LocalBusiness, emplacements, horaires et profils officiels."]]},
 de:{fairLabel:"Verifizierte Fixes",fairTitle:"Kein „Fix erledigt“, wenn sich nichts geändert hat.",fairIntro:"Jeder technische Fix folgt demselben Ablauf: gefunden → geprüft → tatsächlich geändert → erneut geprüft.",fair:[["🟠","Gefunden","RankFix erklärt verständlich, was falsch ist und warum es wichtig ist."],["🔵","Codevorschlag","Die Änderung liegt in einem separaten Pull Request und ist noch nicht live."],["🟡","Noch zu bestätigen","Veröffentliche die Änderung und scanne die Live-Website erneut."],["🟢","Bestätigt","Der Live-Scan bestätigt, dass die Verbesserung vorhanden ist."]],audiences:[["Websites","SEO- & GEO-Audits für öffentliche Webseiten."],["Onlineshops","Produkt-, Kategorie- und Conversion-Signale werden laufend erweitert."],["Apps","Öffentliche App-Landingpages und Store-Inhalte können nach denselben Auditprinzipien geprüft werden."],["Agenturen","Kundenprojekte, Berichte und White-Label-Workflows."]],resources:[["SEO Audit","Technische und On-Page-Signale."],["GEO Audit","Strukturierte Daten und AI-Search-Signale."],["Shop-Audit","Produktdaten, Preise, Vertrauen und E-Commerce-Signale."],["Ads Readiness","Landingpages, Tracking und Conversion-Signale für Google Ads."],["Local SEO","LocalBusiness, Standorte, Öffnungszeiten und offizielle Profile."]]},
 it:{fairLabel:"Fix verificati",fairTitle:"Nessun “fix completato” se non è cambiato nulla.",fairIntro:"Ogni fix tecnico segue lo stesso percorso: rilevato → controllato → realmente modificato → verificato di nuovo.",fair:[["🟠","Rilevato","RankFix spiega in modo chiaro cosa non va e perché è importante."],["🔵","Proposta di codice","La modifica è in una pull request separata e non è ancora online."],["🟡","Da confermare","Pubblica la modifica e scansiona di nuovo il sito live."],["🟢","Confermato","La scansione live conferma che il miglioramento è presente."]],audiences:[["Siti web","Audit SEO & GEO per pagine web pubbliche."],["E-commerce","I segnali di prodotto, categoria e conversione vengono continuamente ampliati."],["App","Landing page pubbliche e contenuti store possono seguire gli stessi principi di audit."],["Agenzie","Progetti clienti, report e workflow white-label."]],resources:[["Audit SEO","Segnali tecnici e on-page."],["Audit GEO","Dati strutturati e segnali di ricerca AI."],["Audit e-commerce","Dati prodotto, prezzi, fiducia e segnali e-commerce."],["Ads Readiness","Landing page, tracking e segnali di conversione per Google Ads."],["SEO locale","LocalBusiness, sedi, orari e profili ufficiali."]]},
 es:{fairLabel:"Mejoras verificadas",fairTitle:"Nada de «arreglo completado» si no ha cambiado nada.",fairIntro:"Cada mejora técnica sigue el mismo proceso: detectada → revisada → realmente modificada → comprobada de nuevo.",fair:[["🟠","Detectado","RankFix explica claramente qué falla y por qué importa."],["🔵","Propuesta de código","El cambio está en una pull request separada y todavía no está publicado."],["🟡","Pendiente de confirmar","Publica el cambio y vuelve a escanear el sitio en vivo."],["🟢","Confirmado","El escaneo en vivo confirma que la mejora está realmente presente."]],audiences:[["Sitios web","Auditorías SEO & GEO para páginas web públicas."],["Tiendas online","Las señales de producto, categoría y conversión se amplían continuamente."],["Apps","Las landing pages públicas y el contenido de tienda pueden usar los mismos principios de auditoría."],["Agencias","Proyectos de clientes, informes y flujos white-label."]],resources:[["Auditoría SEO","Señales técnicas y on-page."],["Auditoría GEO","Datos estructurados y señales de búsqueda con IA."],["Auditoría e-commerce","Datos de producto, precios, confianza y señales e-commerce."],["Preparación Ads","Landing pages, tracking y señales de conversión para Google Ads."],["SEO local","LocalBusiness, ubicaciones, horarios y perfiles oficiales."]]}
} as const;

type Language = keyof typeof translations;

export default function Home({ initialLanguage = "nl" }: { initialLanguage?: Language } = {}) {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [tab, setTab] = useState<"seo" | "geo">("seo");
  const [fixes, setFixes] = useState<Record<string, { title: string; content: string; reason: string }>>({});
  const [fixing, setFixing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [scanStep, setScanStep] = useState(0);
  const [auditMode, setAuditMode] = useState<"seo" | "geo" | "both">("both");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const t = translations[language];
  const renderingCopy = {
    nl:{source:"Bron",raw:"Raw HTML · JavaScript niet uitgevoerd",rendered:"JavaScript-gerenderd",tip:"Dynamische onderdelen zoals checkout, JavaScript-content en sommige voorraad- of prijssignalen kunnen hierdoor niet volledig worden bevestigd."},
    en:{source:"Source",raw:"Raw HTML · JavaScript not executed",rendered:"JavaScript-rendered",tip:"Dynamic parts such as checkout, JavaScript content and some stock or price signals may therefore not be fully confirmed."},
    de:{source:"Quelle",raw:"Raw HTML · JavaScript nicht ausgeführt",rendered:"JavaScript-gerendert",tip:"Dynamische Bereiche wie Checkout, JavaScript-Inhalte und einige Bestands- oder Preissignale können dadurch möglicherweise nicht vollständig bestätigt werden."},
    fr:{source:"Source",raw:"HTML brut · JavaScript non exécuté",rendered:"Rendu JavaScript",tip:"Les éléments dynamiques tels que le paiement, le contenu JavaScript et certains signaux de stock ou de prix peuvent donc ne pas être entièrement confirmés."},
    it:{source:"Fonte",raw:"HTML grezzo · JavaScript non eseguito",rendered:"Rendering JavaScript",tip:"Le parti dinamiche come checkout, contenuti JavaScript e alcuni segnali di disponibilità o prezzo potrebbero quindi non essere confermate completamente."},
    es:{source:"Fuente",raw:"HTML sin procesar · JavaScript no ejecutado",rendered:"Renderizado con JavaScript",tip:"Por ello, las partes dinámicas como el checkout, el contenido JavaScript y algunas señales de stock o precio pueden no confirmarse por completo."}
  }[language];

  const pc = publicCopy[language];
  const sc = sectionCopy[language];
  const xc = extraPublicCopy[language];
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [contactError, setContactError] = useState("");
  const [githubFixing, setGithubFixing] = useState<string | null>(null);
  const [githubProgress, setGithubProgress] = useState(0);
  const [githubResult, setGithubResult] = useState<{url:string;title:string;number:number} | null>(null);
  const [githubAlreadyApplied, setGithubAlreadyApplied] = useState(false);
  const [githubResults, setGithubResults] = useState<Record<string, {url:string;title:string;number:number}>>({});
  const [githubError, setGithubError] = useState("");
  const [authUser, setAuthUser] = useState<{ name?: string; email?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const openContactFromHash = () => {
      if (window.location.hash === "#contact") {
        setContactOpen(true);
      }
    };
    openContactFromHash();
    window.addEventListener("hashchange", openContactFromHash);
    return () => window.removeEventListener("hashchange", openContactFromHash);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        setAuthUser(data.user || null);
        setAuthLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setAuthUser(null);
        setAuthLoading(false);
      });
    return () => { active = false; };
  }, []);


  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileMenuOpen(false);
  }

  function startAudit(mode: "seo" | "geo" | "both") {
    setAuditMode(mode);
    setMobileMenuOpen(false);
    window.setTimeout(() => document.getElementById("scan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function handleContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setContactSending(true);
    setContactSent(false);
    setContactError("");
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          company: form.get("company"),
          message: form.get("message"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bericht verzenden mislukt.");
      setContactSent(true);
      e.currentTarget.reset();
    } catch (err) {
      setContactError(err instanceof Error ? err.message : "Bericht verzenden mislukt.");
    } finally {
      setContactSending(false);
    }
  }

  const scanSteps = [
    "Meta tags controleren",
    "Laadsnelheid meten",
    "Content analyseren",
    "Mobile check uitvoeren",
    "Structured data controleren",
    "SEO & GEO signalen verwerken",
  ];

  useEffect(() => {
    if (!scanning) return;
    setScanStep(0);
    const timer = window.setInterval(() => setScanStep((step) => Math.min(step + 1, scanSteps.length - 1)), 850);
    return () => window.clearInterval(timer);
  }, [scanning]);

  function cleanFixContextValue(value: string) {
    return value.replace(/\s*\|\s*hide no longer\b/gi, "").replace(/\bhide no longer\b/gi, "").replace(/\s{2,}/g, " ").trim();
  }

  async function generateFix(item: Check) {
    if (!result) return;
    setFixing(item.issue_id || item.key);
    try {
      const issueId = item.issue_id || item.rule_id || item.key;
      const type = issueId === "META_TITLE_MISSING" || issueId === "META_TITLE_GUIDANCE" || item.key === "title"
        ? "meta_title"
        : issueId === "META_DESCRIPTION_MISSING" || issueId === "META_DESCRIPTION_GUIDANCE" || item.key === "description"
          ? "meta_description"
          : issueId === "H1_MISSING" || issueId === "H1_MULTIPLE" || item.key === "h1"
            ? "h1"
            : issueId === "faq" || item.key === "faq"
              ? "faq"
              : issueId === "breadcrumbs" || item.key === "breadcrumbs"
                ? "breadcrumb"
                : issueId === "author" || item.key === "author"
                  ? "expertise"
                  : issueId === "SOCIAL_METADATA_INCOMPLETE" || item.key === "social"
                    ? "social_metadata"
                    : issueId === "headings" || item.key === "headings" || item.key === "heading_structure"
                      ? "heading_structure"
                      : issueId === "canonical" || item.key === "canonical" || item.key === "canonical_url"
                        ? "canonical"
                        : issueId === "IMAGE_ALT_MISSING" || item.key === "alt" || item.key === "IMAGE_ALT_MISSING"
                          ? "alt_text"
                          : "structured_data";
      // Structural fixes are deterministic scan data; render them immediately.
      // Keep this logic in the production dashboard bundle so stale AI-fix APIs cannot change the fix type.
      // This is intentionally independent from the /api/ai-fix response.
      if (type === "canonical" || type === "heading_structure" || type === "alt_text") {
        const escapeHtml = (value: string) => value
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const title = cleanFixContextValue(result.metrics.title || new URL(result.finalUrl).hostname);
        if (type === "canonical") {
          setFixes((prev) => ({ ...prev, [item.issue_id || item.key]: {
            title: "Canonical URL voorstel",
            content: `<link rel="canonical" href="${escapeHtml(result.finalUrl)}">`,
            reason: "Gebruikt de uiteindelijke scan-URL als self-referencing canonical."
          }}));
        } else if (type === "heading_structure") {
          const topic = cleanFixContextValue(result.metrics.h1s[0] || result.metrics.title || new URL(result.finalUrl).hostname);
          setFixes((prev) => ({ ...prev, [item.issue_id || item.key]: {
            title: "Heading-structuur voorstel",
            content: `<h2>${escapeHtml(topic)}</h2>\n<h3>Veelgestelde vragen en belangrijke informatie</h3>`,
            reason: "Gebaseerd op de bestaande paginatitel/H1; controleer de onderwerpen voordat je publiceert."
          }}));
        } else {
          const candidates = result.metrics.imageAltCandidates || [];
          const rows = candidates.map(({ src }) => {
            const filename = decodeURIComponent(src.split("?")[0].split("/").pop() || "afbeelding")
              .replace(/[-_]+/g, " ")
              .replace(/\.[a-z0-9]+$/i, "")
              .trim();
            return `<img src="${escapeHtml(src)}" alt="${escapeHtml(filename || title)}">`;
          });
          setFixes((prev) => ({ ...prev, [item.issue_id || item.key]: {
            title: "Alt-teksten voorstel",
            content: rows.join("\n"),
            reason: "Gebaseerd op de gevonden afbeeldings-URL's. Controleer elke alt-tekst visueel voordat je publiceert."
          }}));
        }
        return;
      }
      // Social metadata is deterministic scan data; render the proposal immediately.
      if (type === "social_metadata") {
        const escapeAttr = (value: string) => {
          let decoded = value;
          for (let i = 0; i < 4; i++) {
            const next = decoded
              .replace(/&amp;/gi, "&")
              .replace(/&quot;/gi, '"')
              .replace(/&#39;/gi, "'")
              .replace(/&lt;/gi, "<")
              .replace(/&gt;/gi, ">")
              .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code: string) => {
                const point = code.toLowerCase().startsWith("x") ? parseInt(code.slice(1), 16) : parseInt(code, 10);
                return Number.isFinite(point) ? String.fromCodePoint(point) : "";
              });
            if (next === decoded) break;
            decoded = next;
          }
          return decoded.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };
        const ogTitle = cleanFixContextValue(result.metrics.openGraph.title || result.metrics.title);
        const ogDescription = cleanFixContextValue(result.metrics.openGraph.description || result.metrics.description);
        const ogImage = cleanFixContextValue(result.metrics.openGraph.image || result.metrics.imageAltCandidates?.[0]?.src || "");
        const content = [
          ogTitle ? `<meta property="og:title" content="${escapeAttr(ogTitle)}">` : "",
          ogDescription ? `<meta property="og:description" content="${escapeAttr(ogDescription)}">` : "",
          ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}">` : ""
        ].filter(Boolean).join("\n");
        setFixes((prev) => ({ ...prev, [item.issue_id || item.key]: {
          title: "Open Graph metadata voorstel",
          content,
          reason: ogImage ? (result.metrics.openGraph.image ? "Gebruikt bestaande paginatitel, beschrijving en gevonden Open Graph-afbeelding." : "Gebruikt bestaande paginatitel, beschrijving en een bestaande afbeelding van de gescande pagina als og:image.") : "Er is geen bestaande afbeeldings-URL gevonden om veilig als og:image te gebruiken."
        }}));
        return;
      }
      const response = await fetch("/api/ai-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: result.finalUrl, issue_id: item.issue_id || item.key, request_id: crypto.randomUUID(), type, current: item.key === "title" ? result.metrics.title : item.key === "description" ? result.metrics.description : item.key === "h1" ? (result.metrics.h1s[0] || "") : "", context: { title: cleanFixContextValue(result.metrics.title), description: cleanFixContextValue(result.metrics.description), h1: cleanFixContextValue(result.metrics.h1s[0] || ""), canonical: cleanFixContextValue(result.metrics.canonical || ""), imageAltCandidates: result.metrics.imageAltCandidates || [], ogTitle: cleanFixContextValue(result.metrics.openGraph.title || ""), ogDescription: cleanFixContextValue(result.metrics.openGraph.description || ""), ogImage: cleanFixContextValue(result.metrics.openGraph.image || ""), ...(type === "structured_data" ? { recommendedSchema: result.metrics.recommendedSchema || "", ...(result.metrics.localBusinessDetails || {}) } : {}) }, issue_status: item.issue_status || (item.status === "warning" ? "WARNING" : item.status === "fail" ? "FAIL" : "PASS") }) });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Fix mislukt.");
      }
      setFixes((prev) => ({ ...prev, [item.issue_id || item.key]: data.fix }));
    } catch (err) { setError(err instanceof Error ? err.message : "Fix mislukt."); }
    finally { setFixing(null); }
  }

  async function createGithubFix(item: Check) {
    if (!result) return;
    const key = item.issue_id || item.key;
    setGithubFixing(key); setGithubProgress(8); setGithubResult(null); setGithubAlreadyApplied(false); setGithubError("");
    try {
      const issueId = item.issue_id || item.rule_id || item.key;
      const context = ["URL: " + result.finalUrl, "Scan URL: " + result.scannedUrl, "Issue: " + item.title, "Recommendation: " + item.fix, "Current title: " + cleanFixContextValue(result.metrics.title), "Current description: " + cleanFixContextValue(result.metrics.description), "H1: " + cleanFixContextValue(result.metrics.h1s[0] || ""), "Canonical: " + cleanFixContextValue(result.metrics.canonical || ""), "OG title: " + cleanFixContextValue(result.metrics.openGraph.title || ""), "OG description: " + cleanFixContextValue(result.metrics.openGraph.description || ""), "OG image: " + cleanFixContextValue(result.metrics.openGraph.image || ""), "Existing page image candidate: " + cleanFixContextValue(result.metrics.imageAltCandidates?.[0]?.src || ""), "Image alt candidates: " + JSON.stringify(result.metrics.imageAltCandidates || [])].join("\n");
      setGithubProgress(30);
      const response = await fetch("/api/github/fix", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ issue:item.title + ": " + item.fix, context, url:result.finalUrl, issue_id:issueId }) });
      setGithubProgress(72);
      const contentType = response.headers.get("content-type") || "";
      const raw = await response.text();
      let data: any = null;
      if (contentType.includes("application/json")) {
        try { data = JSON.parse(raw); } catch {}
      }
      if (!response.ok) {
        throw new Error(
          data?.error ||
          `RankFix kon de verbetering niet uitvoeren (HTTP ${response.status}). Controleer of de nieuwste Render-deploy actief is.`
        );
      }
      if (!data) {
        throw new Error(
          `RankFix kreeg geen JSON terug van /api/github/fix (content-type: ${contentType || "onbekend"}).`
        );
      }
      setGithubProgress(100);
      if (data.alreadyApplied) {
        setGithubAlreadyApplied(true);
        return;
      }
      if (!data.pr?.url || !data.pr?.number) throw new Error("RankFix kon de technische wijziging niet veilig afronden.");
      const prResult = {url:data.pr.url,title:data.pr.title,number:data.pr.number};
      setGithubResult(prResult);
      setGithubResults((prev) => ({ ...prev, [key]: prResult }));
      setResult((prev) => {
        if (!prev) return prev;
        const markWaiting = (checks: Check[]) => checks.map((check) => (
          (check.issue_id || check.key) === key ? { ...check, fix_status: "WAITING" as const } : check
        ));
        return { ...prev, seo: { ...prev.seo, checks: markWaiting(prev.seo.checks) }, geo: { ...prev.geo, checks: markWaiting(prev.geo.checks) } };
      });
    } catch (err) { setGithubError(err instanceof Error ? err.message : "GitHub fix mislukt."); }
    finally { setTimeout(() => setGithubFixing(null), 500); }
  }
  async function copyFix(key: string) {
    const content = fixes[key]?.content;
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    setScanning(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, mode: auditMode, language }),
      });
      const contentType = response.headers.get("content-type") || "";
      const raw = await response.text();
      let data: any = null;
      if (contentType.includes("application/json")) {
        try { data = JSON.parse(raw); } catch {}
      }
      if (!response.ok) {
        throw new Error(
          data?.error ||
          `Scan endpoint gaf HTTP ${response.status} terug. Controleer of de nieuwste Render-deploy actief is.`
        );
      }
      if (!data) {
        throw new Error(
          `RankFix kreeg geen JSON terug van /api/scan (content-type: ${contentType || "onbekend"}).`
        );
      }
      setResult(data);
      setTab(auditMode === "geo" ? "geo" : "seo");
      setTimeout(() => document.getElementById("resultaat")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan mislukt.");
    } finally {
      setScanning(false);
    }
  }

  const ar = auditResultCopy[language];
  const wf = workflowCopy[language];
  const activeChecks = result ? (tab === "seo" ? result.seo.checks : result.geo.checks) : [];
  // The top-level result summarizes the complete requested audit. In SEO + GEO mode
  // it must not hide GEO issues merely because the details initially open on the SEO tab.
  const summaryChecks = result
    ? result.mode === "both"
      ? [...result.seo.checks, ...result.geo.checks]
      : activeChecks
    : [];
  const waitingIssues = useMemo(() => summaryChecks.filter((item) => item.fix_status === "WAITING"), [summaryChecks]);
  const issues = useMemo(() => summaryChecks.filter((item) => {
    const key = item.issue_id || item.key;
    return (item.status === "fail" || item.status === "warning") && item.fix_status !== "WAITING" && !githubResults[key];
  }), [summaryChecks, githubResults]);
  const passedCount = result?.summary?.passed ?? summaryChecks.filter((item) => item.status === "pass").length;
  const preparedCount = summaryChecks.filter((item) => {
    const key = item.issue_id || item.key;
    return item.fix_status === "WAITING" || Boolean(githubResults[key]);
  }).length;
  const remainingCount = issues.length;
  const totalIssueCount = remainingCount + preparedCount;
  const resultHttpStatus = result ? Number(result.httpStatus) : 0;
  const blockedHttpStatus = resultHttpStatus === 401 || resultHttpStatus === 403;
  const rateLimitedHttpStatus = resultHttpStatus === 429;
  const serverErrorHttpStatus = resultHttpStatus >= 500 && resultHttpStatus <= 599;
  const pageNotFound = resultHttpStatus === 404 || resultHttpStatus === 410;
  const stopContentAudit = pageNotFound || blockedHttpStatus || rateLimitedHttpStatus || serverErrorHttpStatus;
  const stoppedAuditTitle = pageNotFound
    ? `Pagina niet gevonden — HTTP ${resultHttpStatus}`
    : blockedHttpStatus
      ? `Toegang tot pagina geblokkeerd — HTTP ${resultHttpStatus}`
      : rateLimitedHttpStatus
        ? "Website beperkt tijdelijk scans — HTTP 429"
        : `Serverfout op website — HTTP ${resultHttpStatus}`;
  const stoppedAuditMessage = pageNotFound
    ? "RankFix kan deze URL niet betrouwbaar auditen omdat de server geen geldige pagina retourneert. Controleer de URL en voer de scan opnieuw uit. SEO- en GEO-inhoudsfouten van deze foutpagina worden daarom niet als verbeterpunten gepresenteerd."
    : blockedHttpStatus
      ? "RankFix krijgt geen toegang tot deze pagina. Controleer of de pagina publiek toegankelijk is en of een firewall, login of beveiligingsregel de scan blokkeert. Voer daarna de scan opnieuw uit."
      : rateLimitedHttpStatus
        ? "De website accepteert momenteel te veel verzoeken of beperkt automatische scans. Wacht even en probeer de scan opnieuw. RankFix presenteert de tijdelijke foutpagina niet als SEO- of GEO-probleem."
        : "De website retourneert een serverfout. Controleer de website of hosting en voer de scan opnieuw uit zodra de pagina normaal bereikbaar is. RankFix presenteert deze foutpagina niet als SEO- of GEO-probleem.";

  return (
    <main className="rankfix-home min-h-screen bg-[#07172B] text-[#F7FBFF] selection:bg-emerald-300 selection:text-[#032D24]">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-40">
        <div className="absolute left-1/2 top-[-220px] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
        <div className="absolute right-[-180px] top-[520px] h-[420px] w-[420px] rounded-full bg-blue-600/10 blur-[120px]" />
      </div>

      <nav className="sticky top-0 z-50 mx-auto w-full border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-5 lg:px-8">
          <Link href={"/"+language} className="flex shrink-0 items-center gap-3" onClick={() => setMobileMenuOpen(false)} aria-label="RankFix AI home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-300 to-blue-600 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/10">RF</span>
            <span className="text-lg font-bold tracking-tight">RankFix <span className="text-emerald-300">AI</span></span>
          </Link>
          <div className="hidden items-center gap-6 text-sm text-slate-600 lg:flex">
            <button type="button" onClick={() => scrollToSection("scan")} className="rf-top-link">{t.audit}</button>
            <Link href="#features" className="rf-top-link">{t.moreInfo}</Link>
            <Link href="#about" className="rf-top-link">{t.forWho}</Link>
            <Link href="#pricing" className="rf-top-link">{t.pricing}</Link>
            <button type="button" onClick={() => setContactOpen(true)} className="rf-top-link">{t.contact}</button>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <details className="rf-public-language">
              <summary aria-label={t.language}><span className={"fi fi-"+({nl:"nl",en:"gb",de:"de",fr:"fr",it:"it",es:"es"} as Record<Language,string>)[language]} aria-hidden="true"/><b>{language.toUpperCase()}</b><span aria-hidden="true">⌄</span></summary>
              <div className="rf-public-language-menu">
                {(["nl","en","de","fr","it","es"] as Language[]).map(code=><button key={code} type="button" aria-current={language===code?"true":undefined} onClick={()=>{setLanguage(code);window.location.href="/"+code}}><span className={"fi fi-"+({nl:"nl",en:"gb",de:"de",fr:"fr",it:"it",es:"es"} as Record<Language,string>)[code]} aria-hidden="true"/> <b>{code.toUpperCase()}</b></button>)}
              </div>
            </details>
            {!authLoading && (authUser ? (
              <Link href="/dashboard" className="rf-desktop-dashboard-button">Dashboard</Link>
            ) : (
              <>
                <Link href={`/account?mode=login&lang=${language}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium transition hover:bg-slate-100 sm:px-4 sm:text-sm">{t.login}</Link>
                <Link href={`/account?mode=register&lang=${language}`} className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-100 sm:px-4 sm:text-sm">{t.register}</Link>
              </>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 lg:hidden">
            <label className="sr-only" htmlFor="language-mobile-top">{t.language}</label>
            <select id="language-mobile-top" value={language} onChange={(e) => { const next=e.target.value as Language; setLanguage(next); window.location.href="/"+next; }} className="h-11 max-w-[96px] rounded-xl border border-slate-600 bg-[#102A46] px-2 text-xs font-semibold text-white outline-none">
              <option value="nl">🇳🇱 NL</option><option value="en">🇬🇧 EN</option><option value="fr">🇫🇷 FR</option><option value="de">🇩🇪 DE</option><option value="it">🇮🇹 IT</option><option value="es">🇪🇸 ES</option>
            </select>
            {!authLoading && <Link href={authUser?"/dashboard":`/account?mode=login&lang=${language}`} className="flex h-11 items-center rounded-xl border border-slate-600 bg-[#102A46] px-3 text-xs font-bold text-slate-100">{authUser?"Dashboard":t.login}</Link>}
          </div>
          <button type="button" aria-label={mobileMenuOpen ? (language==="nl"?"Menu sluiten":language==="de"?"Menü schließen":language==="fr"?"Fermer le menu":language==="it"?"Chiudi menu":language==="es"?"Cerrar menú":"Close menu") : (language==="nl"?"Menu openen":language==="de"?"Menü öffnen":language==="fr"?"Ouvrir le menu":language==="it"?"Apri menu":language==="es"?"Abrir menú":"Open menu")} aria-controls="rankfix-mobile-menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-200 lg:hidden">
            {mobileMenuOpen ? <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14 M19 5L5 19" /></svg> : <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16 M4 12h16 M4 18h16" /></svg>}
          </button>
        </div>
        {mobileMenuOpen && (
          <div id="rankfix-mobile-menu" className="max-h-[calc(100dvh-68px)] overflow-y-auto border-t border-slate-200 px-4 pb-5 pt-3 lg:hidden">
            <div className="grid gap-1">
              {[[t.audit,"#scan"],[t.moreInfo,"#features"],[t.forWho,"#about"],[t.pricing,"#pricing"],[t.contact,"#footer"]].map(([label,href]) => (
                href === "#footer" ? (
                  <button key={label} type="button" onClick={() => { setMobileMenuOpen(false); setContactOpen(true); }} className="rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-300 hover:bg-slate-50 hover:text-violet-700">{label}</button>
                ) : (
                  <Link key={label} href={href} onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-50 hover:text-violet-700">{label}</Link>
                )
              ))}
            </div>
            <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3">
              {!authLoading && (authUser ? (
                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-950">Dashboard</Link>
              ) : (
                <>
                  <Link href={`/account?mode=login&lang=${language}`} onClick={() => setMobileMenuOpen(false)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-900">{t.login}</Link>
                  <Link href={`/account?mode=register&lang=${language}`} onClick={() => setMobileMenuOpen(false)} className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-950">{t.register}</Link>
                </>
              ))}
            </div>
          </div>
        )}
      </nav>

      <section id="scan" className="mx-auto max-w-6xl px-5 pb-16 pt-16 text-center lg:px-8 lg:pt-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-xs font-semibold text-emerald-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
          {t.badge}
        </div>
        <h1 className="mx-auto max-w-4xl text-4xl font-black tracking-[-0.04em] sm:text-6xl lg:text-7xl">
          {t.hero}
          <span className="block bg-gradient-to-r from-emerald-500 via-violet-500 to-blue-500 bg-clip-text text-transparent">{t.hero2}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
          {t.intro}
        </p>

        <div className="mx-auto mt-9 max-w-3xl rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-300/30 backdrop-blur">
          <div className="mb-3 grid grid-cols-3 gap-1.5 sm:gap-2">
            {[
              ["seo", "SEO", t.seoDesc],
              ["geo", "GEO", t.geoDesc],
              ["both", "SEO + GEO", t.bothDesc],
            ].map(([value, label, description]) => (
              <button key={value} type="button" aria-pressed={auditMode === value} onClick={() => setAuditMode(value as "seo" | "geo" | "both")} className={`min-w-0 rounded-xl border px-2 py-3 text-center transition sm:px-4 sm:text-left ${auditMode === value ? "border-emerald-300/50 bg-emerald-300/10 text-slate-900 shadow-lg shadow-emerald-500/5" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-violet-700"}`}>
                <div className="flex items-center justify-center gap-1 text-xs font-bold sm:justify-start sm:text-sm"><span className={`h-2 w-2 shrink-0 rounded-full ${auditMode === value ? "bg-emerald-300" : "bg-slate-700"}`} />{label}</div>
                <div className="mt-1 hidden text-[11px] leading-4 text-slate-600 sm:block">{description}</div>
              </button>
            ))}
          </div>
          <form onSubmit={handleScan} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              inputMode="url"
              aria-label={language==="nl"?"Websiteadres":language==="de"?"Website-Adresse":language==="fr"?"Adresse du site":language==="it"?"Indirizzo del sito":language==="es"?"Dirección del sitio":"Website address"}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="jouwdomein.nl"
              required
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-[#16233A] px-4 py-4 text-base outline-none placeholder:text-slate-600 focus:border-emerald-300 sm:border-0 sm:bg-transparent sm:text-sm"
            />
            <button
              disabled={scanning}
              className="rounded-xl bg-emerald-300 px-6 py-4 text-sm font-bold text-[#032D24] shadow-lg shadow-emerald-500/10 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {scanning ? t.scanning : `${t.start} ${auditMode === "seo" ? "SEO" : auditMode === "geo" ? "GEO" : "SEO + GEO"} ${t.auditStart}`}
            </button>
          </form>
        </div>
        <div className="mx-auto mt-4 max-w-4xl px-2">
          <div className="flex flex-wrap justify-center gap-2 text-xs font-semibold text-emerald-100">
            {(language === "nl"
              ? ["SEO","GEO / AI Search","Security","Techniek","Webshop","EU-Omnibus & Consumer Rights","Merchant Readiness","Ads & Analytics","Search Console","Consent Mode","Local SEO","Structured Data","Toegankelijkheid","Quality & Trust","Broken Links","Redirects"]
              : language === "de"
                ? ["SEO","GEO / AI Search","Security","Technik","Onlineshop","EU-Omnibus & Consumer Rights","Merchant Readiness","Ads & Analytics","Search Console","Consent Mode","Local SEO","Structured Data","Barrierefreiheit","Quality & Trust","Broken Links","Redirects"]
                : language === "fr"
                  ? ["SEO","GEO / AI Search","Security","Technique","E-commerce","EU-Omnibus & Consumer Rights","Merchant Readiness","Ads & Analytics","Search Console","Consent Mode","SEO local","Données structurées","Accessibilité","Quality & Trust","Liens cassés","Redirections"]
                  : language === "it"
                    ? ["SEO","GEO / AI Search","Security","Tecnica","E-commerce","EU-Omnibus & Consumer Rights","Merchant Readiness","Ads & Analytics","Search Console","Consent Mode","SEO locale","Dati strutturati","Accessibilità","Quality & Trust","Link non validi","Redirect"]
                    : language === "es"
                      ? ["SEO","GEO / AI Search","Security","Técnica","E-commerce","EU-Omnibus & Consumer Rights","Merchant Readiness","Ads & Analytics","Search Console","Consent Mode","SEO local","Datos estructurados","Accesibilidad","Quality & Trust","Enlaces rotos","Redirecciones"]
                      : ["SEO","GEO / AI Search","Security","Technical","E-commerce","EU-Omnibus & Consumer Rights","Merchant Readiness","Ads & Analytics","Search Console","Consent Mode","Local SEO","Structured Data","Accessibility","Quality & Trust","Broken Links","Redirects"]
            ).map((feature) => <span key={feature} className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5">✓ {feature}</span>)}
          </div>
          <p className="mt-3 text-center text-xs text-slate-300">
            {language === "nl"
              ? "Begin klein en breid later alleen uit wat je nodig hebt · extra functies vanaf €2,95 p/m"
              : language === "de"
                ? "Klein starten und später nur das ergänzen, was du brauchst · Extras ab €2,95/Monat"
                : language === "fr"
                  ? "Commencez simplement et ajoutez ensuite uniquement ce dont vous avez besoin · options dès 2,95 €/mois"
                  : language === "it"
                    ? "Inizia in piccolo e aggiungi in seguito solo ciò che ti serve · extra da €2,95/mese"
                    : language === "es"
                      ? "Empieza con lo esencial y añade después solo lo que necesites · extras desde 2,95 €/mes"
                      : "Start small and add only what you need later · extras from €2.95/month"}
          </p>
        </div>
        {error && <div className="mx-auto mt-5 max-w-2xl rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}

        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-3 text-left sm:grid-cols-4">
          {[
            ["SEO", `${pc.tech} + on-page`],
            ["GEO", "AI-search readiness"],
            ["AI Fix", pc.concrete],
            ["Reports", pc.ready],
          ].map(([title, text]) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold">{title}</div>
              <div className="mt-1 text-xs text-slate-500">{text}</div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-5xl overflow-hidden rounded-[28px] border border-slate-200 bg-[#0B1830] p-2 shadow-2xl shadow-blue-950/30">
          <img
            src="/opengraph-image"
            alt={language==="nl"?"RankFix AI SEO- en GEO-dashboardvoorbeeld":language==="de"?"Vorschau des RankFix AI SEO- und GEO-Dashboards":language==="fr"?"Aperçu du tableau de bord SEO et GEO de RankFix AI":language==="it"?"Anteprima della dashboard SEO e GEO di RankFix AI":language==="es"?"Vista previa del panel SEO y GEO de RankFix AI":"RankFix AI SEO and GEO dashboard preview"}
            className="block h-auto w-full rounded-[22px]"
            loading="eager"
          />
        </div>
      </section>

      {scanning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B1220]/80 px-4 py-6 backdrop-blur-xl">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-[#101B2D]/95 p-5 shadow-2xl shadow-blue-950/50 sm:p-8">
            <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />
            <div className="relative">
              <div className="mb-7 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-300 to-blue-600 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20">RF</span>
                  <div><div className="text-sm font-bold">RankFix <span className="text-emerald-300">AI</span></div><div className="text-[11px] text-slate-500">SEO Scanner</div></div>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">Live scan</span>
              </div>

              <div className="grid items-center gap-8 md:grid-cols-[240px_1fr]">
                <div className="mx-auto flex h-[210px] w-[210px] items-center justify-center sm:h-[235px] sm:w-[235px]">
                  <div className="relative flex h-full w-full items-center justify-center rounded-full border-[18px] border-slate-800/80 shadow-inner shadow-black/40">
                    <div className="absolute inset-[-18px] animate-[spin_2.2s_linear_infinite] rounded-full border-[18px] border-transparent border-t-emerald-300 border-r-blue-600 shadow-[0_0_35px_rgba(34,211,238,0.18)]" />
                    <div className="flex h-24 w-24 flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600/30 to-emerald-300/10 ring-1 ring-emerald-300/20">
                      <svg viewBox="0 0 24 24" className="h-10 w-10 text-emerald-200" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
                      <span className="mt-1 text-[11px] font-bold text-slate-900">{wf.scanning}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{wf.analyzing}</div>
                  <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{wf.checking}</h2>
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/[0.035] px-4 py-3">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-300" />
                    <span className="truncate text-sm font-semibold text-slate-200">{url}</span>
                  </div>
                  <div className="mt-6 space-y-3">
                    {scanSteps.map((step, index) => {
                      const done = index < scanStep;
                      const active = index === scanStep;
                      return <div key={step} className={`flex items-center gap-3 text-sm transition-all duration-500 ${done ? "text-emerald-300" : active ? "text-slate-900" : "text-slate-600"}`}>
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${done ? "border-emerald-400/40 bg-emerald-400/10" : active ? "border-emerald-300/40 bg-emerald-300/10" : "border-slate-200 bg-white/[0.02]"}`}>
                          {done ? "✓" : active ? <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-700" />}
                        </span>
                        <span>{step}</span>
                        {active && <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-emerald-300">bezig</span>}
                      </div>;
                    })}
                  </div>
                </div>
              </div>
              <div className="mt-7 flex items-center justify-between border-t border-slate-200 pt-5 text-[11px] text-slate-600">
                <span>SEO · GEO · Performance · Content</span>
                <span>Even geduld…</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {githubFixing && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#0B1220]/85 px-4 py-6 backdrop-blur-xl">
          <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-[#101B2D] p-6 shadow-2xl sm:p-8">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-300 to-teal-600 text-sm font-black text-slate-950">RF</span><div><div className="font-bold">{wf.preparing}</div><div className="text-xs text-slate-600">{wf.liveSafe}</div></div></div>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-black/20 p-5">
              <div className="flex items-center justify-center">
                <div className="relative h-20 w-20">
                  <div className="absolute inset-0 rounded-full border border-emerald-300/10"></div>
                  <div className="absolute inset-1 animate-spin rounded-full border-2 border-transparent border-t-emerald-300 border-r-blue-400"></div>
                  <div className="absolute inset-4 grid place-items-center rounded-full bg-emerald-300/10 shadow-[0_0_35px_rgba(103,232,249,0.12)]">
                    <span className="text-lg">✦</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 text-center text-base font-bold text-slate-900">{githubProgress < 30 ? wf.collecting : githubProgress < 70 ? wf.validating : githubProgress < 100 ? wf.staging : wf.almost}</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-blue-400 to-violet-400 transition-all duration-700" style={{width: githubProgress + "%"}} />
              </div>
              <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-widest text-slate-600"><span>Analyseren</span><span>Controleren</span><span>Klaar</span></div>
              <p className="mt-4 text-center text-xs leading-5 text-slate-600">Dit kan even duren. Controleer daarna de wijziging in de pull request voordat je die publiceert.</p>
            </div>
          </div>
        </div>
      )}

      {githubAlreadyApplied && !githubFixing && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-[#0B1220]/80 px-4 py-6 backdrop-blur-xl">
          <div className="w-full max-w-lg rounded-[28px] border border-emerald-400/20 bg-[#101B2D] p-6 shadow-2xl sm:p-8">
            <div className="text-4xl">🟢</div>
            <div className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{wf.already}</div>
            <h2 className="mt-2 text-2xl font-black">{wf.alreadyTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{wf.alreadyText}</p>
            <div className="mt-5 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.035] p-4 text-sm leading-6 text-slate-300">
              <span className="font-bold text-emerald-200">{wf.nothing}</span>
              <div className="mt-1 text-slate-500">{wf.noChange}</div>
            </div>
            <button type="button" onClick={() => setGithubAlreadyApplied(false)} className="mt-6 w-full rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950">{wf.backResult}</button>
          </div>
        </div>
      )}

      {githubResult && !githubFixing && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-[#0B1220]/80 px-4 py-6 backdrop-blur-xl">
          <div className="w-full max-w-lg rounded-[28px] border border-emerald-400/20 bg-[#101B2D] p-6 shadow-2xl sm:p-8">
            <div className="text-4xl">🔵</div>
            <div className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{wf.proposal}</div>
            <h2 className="mt-2 text-2xl font-black">{wf.proposalTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{wf.proposalText}</p>
            <div className="mt-5 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.035] p-4 text-sm leading-6 text-slate-300">
              <span className="font-bold text-emerald-200">{wf.publish}</span>
              <div className="mt-1 text-slate-600">{wf.publishText}</div>
            </div>
            <Link href={githubResult.url} target="_blank" rel="noopener noreferrer" className="mt-4 block rounded-xl border border-emerald-300/30 px-5 py-3 text-center text-sm font-bold text-emerald-200">{wf.viewPr}</Link>
            <button type="button" onClick={() => setGithubResult(null)} className="mt-6 w-full rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950">{wf.backResult}</button>
          </div>
        </div>
      )}

      {githubError && !githubFixing && (
        <div className="fixed bottom-5 right-5 z-[125] max-w-md rounded-2xl border border-red-400/20 bg-[#12080b] p-4 text-sm text-red-200 shadow-2xl">{githubError}<button type="button" onClick={() => setGithubError("")} className="ml-3 text-red-300 underline">{language==="nl"?"Sluiten":language==="de"?"Schließen":language==="fr"?"Fermer":language==="it"?"Chiudi":language==="es"?"Cerrar":"Close"}</button></div>
      )}

      {result && (
        stopContentAudit ? (
          <section id="resultaat" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-12 lg:px-8">
            <div className="rounded-[28px] border border-red-400/20 bg-red-400/[0.045] p-5 shadow-2xl shadow-black/10 sm:p-6">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">{wf.stopped}</div>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{stoppedAuditTitle}</h2>
              <p className="mt-1 max-w-2xl break-all text-xs text-slate-500">{result.finalUrl}</p>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">{stoppedAuditMessage}</p>
            </div>
          </section>
        ) : (
        <section id="resultaat" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-12 lg:px-8">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">{wf.liveAudit}</div>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{ar.opportunities}</h2>
              <p className="mt-1 max-w-2xl break-all text-xs text-slate-500">{result.finalUrl}</p>
            </div>
            <div className="text-xs text-slate-500">{result.responseTime} ms · HTTP {result.httpStatus}</div>{result.rendering&&<div className="mt-1 text-xs text-slate-500">{renderingCopy.source}: {result.rendering.mode==="raw_html"?renderingCopy.raw:renderingCopy.rendered}{result.rendering.mode==="raw_html"&&<span className="ml-1 cursor-help" title={renderingCopy.tip}>ⓘ</span>}{result.pageTypeEvidence?` · ${result.pageTypeEvidence.type} (${result.pageTypeEvidence.confidence})`:""}</div>}
            <WebsiteProfile profile={result.technologyProfile} />
            {result.sectorProfile&&<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">Sector: {result.sectorProfile.label}</span><span>Zekerheid {result.sectorProfile.confidenceScore??(result.sectorProfile.confidence==="high"?90:result.sectorProfile.confidence==="medium"?70:50)}%</span></div>}
          </div>

          <div className="mb-6 rounded-[28px] border border-slate-200 bg-gradient-to-br from-white/[0.055] to-emerald-400/[0.025] p-5 shadow-2xl shadow-black/10 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{ar.result}</div>
                <h3 className="mt-2 text-2xl font-black tracking-tight">{ar.resultTitle}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{ar.resultIntro}</p>
              </div>
              <div className="rounded-full border border-slate-200 bg-black/10 px-3 py-1.5 text-xs font-semibold text-slate-600">{totalIssueCount} {totalIssueCount === 1 ? ar.improvement : ar.improvements} {ar.found}</div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.045] p-4"><div className="text-lg">🟢</div><div className="mt-2 text-sm font-bold text-emerald-200">{ar.done}</div><div className="mt-1 text-2xl font-black">{passedCount}</div><p className="mt-1 text-xs leading-5 text-slate-500">{ar.doneText}</p></div>
              <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.045] p-4"><div className="text-lg">🟠</div><div className="mt-2 text-sm font-bold text-amber-200">{ar.todo}</div><div className="mt-1 text-2xl font-black">{remainingCount}</div><p className="mt-1 text-xs leading-5 text-slate-500">{ar.todoText}</p></div>
              <div className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.045] p-4"><div className="text-lg">🔵</div><div className="mt-2 text-sm font-bold text-blue-200">{ar.proposal}</div><div className="mt-1 text-2xl font-black">{preparedCount}</div><p className="mt-1 text-xs leading-5 text-slate-600">{ar.proposalText}</p></div>
              <div className="rounded-2xl border border-yellow-400/15 bg-yellow-400/[0.045] p-4"><div className="text-lg">🟡</div><div className="mt-2 text-sm font-bold text-yellow-200">{ar.confirm}</div><div className="mt-1 text-2xl font-black">{waitingIssues.length}</div><p className="mt-1 text-xs leading-5 text-slate-600">{ar.confirmText}</p></div>
            </div>
            <div className="mt-4 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.035] px-4 py-3 text-sm text-slate-300">{preparedCount ? ar.checkPr : remainingCount ? ar.openIssue : ar.allGood}</div>
          </div>

          {waitingIssues.length > 0 && (
            <div className="mb-4 rounded-3xl border border-yellow-400/15 bg-yellow-400/[0.035] p-5">
              <div className="text-xs font-bold uppercase tracking-widest text-yellow-300">{ar.confirm}</div>
              <div className="mt-1 text-lg font-black">{waitingIssues.length} {waitingIssues.length === 1 ? "codevoorstel" : "codevoorstellen"} wachten op een nieuwe live controle.</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">Deze problemen zijn nog niet opgelost. Controleer de pull request, publiceer en scan daarna opnieuw. Pas wanneer de live controle slaagt, telt de fix als bevestigd.</p>
              <div className="mt-4 space-y-2">
                {waitingIssues.slice(0, 5).map((item) => (
                  <div key={item.issue_id || item.key} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-black/10 p-3">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-yellow-400/10 text-xs font-bold text-yellow-300">!</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{item.title}</div>
                      <p className="mt-0.5 text-sm leading-5 text-slate-500">Deze verbetering staat al klaar. RankFix wacht op de technische controle.</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white/[0.035] p-6">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Overall</div>
              <div className="mt-2 text-6xl font-black tracking-tighter text-emerald-300">{result.overallScore}</div>
              <div className="mt-1 text-sm text-slate-500">Grade {result.grade}</div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-blue-500" style={{ width: `${result.overallScore}%` }} />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {([["seo", result.seo], ["geo", result.geo]] as const)
                  .filter(([key]) => result.mode === "both" || result.mode === key)
                  .map(([key, data]) => (
                    <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-xl border px-3 py-2 text-left transition ${tab === key ? "border-emerald-300/30 bg-emerald-300/10 text-slate-900" : "border-slate-200 bg-white/[0.02] text-slate-500 hover:text-violet-700"}`}>
                      <div className="text-[10px] font-bold uppercase tracking-widest">{key}</div>
                      <div className="mt-1 text-xl font-black">{data.score}</div>
                    </button>
                  ))}
              </div>
            </div>

            <div className="space-y-4">
              {issues.length > 0 ? (
                <div className="rounded-3xl border border-amber-400/15 bg-amber-400/[0.035] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-amber-300">{ar.todo}</div>
                      <div className="mt-1 text-lg font-black">{issues.length} {issues.length === 1 ? "verbeterpunt" : "verbeterpunten"}</div>
                    </div>
                    <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">{remainingCount > 0 ? ar.next : ar.ready}</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {issues.map((item) => (
                      <div key={item.issue_id || item.key} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-black/10 p-3">
                        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-bold ${item.status === "warning" ? "bg-amber-400/10 text-amber-300" : "bg-red-400/10 text-red-300"}`}>{statusIcon[item.status]}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{item.title}</div>
                          <p className="mt-0.5 text-sm leading-5 text-slate-500">{item.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.035] p-5">
                  <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">Alles gecontroleerd</div>
                  <div className="mt-1 text-lg font-black">Geen actieve verbeterpunten gevonden.</div>
                </div>
              )}

              {result.mode === "both" && (
                <div className="rounded-3xl border border-slate-200 bg-white/[0.035] p-2">
                  <div className="grid grid-cols-2 gap-2">
                    {([["seo", result.seo], ["geo", result.geo]] as const).map(([key, data]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${tab === key ? "border-emerald-300/30 bg-emerald-300/10 text-slate-900" : "border-slate-200 bg-white/[0.02] text-slate-500 hover:bg-white/[0.05] hover:text-violet-700"}`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-widest">{key} audit</div>
                        <div className="mt-2">
                          <div className="whitespace-nowrap text-xl font-black">{data.score}<span className="ml-0.5 text-xs font-bold opacity-60">/100</span></div>
                          <div className="mt-2">
                            <span className="inline-flex whitespace-nowrap rounded-full border border-current/10 bg-white/60 px-2 py-1 text-[11px] font-semibold">{ar.coverage}: {data.checks.filter((item) => item.status !== "not_applicable" && item.status !== "unable_to_confirm").length}/{data.checks.length}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="px-2 pb-1 pt-2 text-xs text-slate-500">{ar.coverageInfo}</p>
                </div>
              )}

              <div className="rounded-3xl border border-slate-200 bg-white/[0.035] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500">{tab.toUpperCase()} audit</div>
                    <div className="mt-1 text-lg font-black">{ar.coverage}: {activeChecks.filter((item) => item.status !== "not_applicable" && item.status !== "unable_to_confirm").length}/{activeChecks.length} {ar.assessed}</div>
                    <div className="mt-1 text-xs text-slate-500">{activeChecks.filter((item) => item.status === "pass").length} {ar.passed} · {activeChecks.filter((item) => item.status === "warning" || item.status === "fail").length} {ar.improvements} · {activeChecks.filter((item) => item.status === "not_applicable" || item.status === "unable_to_confirm").length} {ar.naOrUnknown}</div>
                  </div>
                  <span className="text-xs text-slate-600">{activeChecks.length} {ar.checks}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeChecks.filter((item) => item.status === "pass").slice(0, 8).map((item) => (
                    <span key={item.issue_id || item.key} className="rounded-full border border-emerald-400/10 bg-emerald-400/[0.04] px-3 py-1.5 text-xs text-emerald-200">✓ {item.title}</span>
                  ))}
                  {activeChecks.filter((item) => item.status === "pass").length > 8 && (
                    <span className="rounded-full border border-slate-200 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-500">+{activeChecks.filter((item) => item.status === "pass").length - 8} {ar.more}</span>
                  )}
                </div>
              </div>

              <details className="rounded-3xl border border-slate-200 bg-slate-50">
                <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-300">
                  <span className="mr-2">⌄</span> {ar.technical}
                </summary>
                <div className="border-t border-slate-200 px-5 py-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activeChecks.filter((item) => {
                      const key = item.issue_id || item.key;
                      return item.status === "pass" || (item.fix_status !== "WAITING" && !githubResults[key]);
                    }).map((item) => (
                      <div key={item.issue_id || item.key} className="rounded-2xl border border-slate-200 bg-black/10 p-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${item.status === "pass" ? "text-emerald-300" : item.status === "warning" ? "text-amber-300" : item.status === "fail" ? "text-red-300" : "text-cyan-300"}`}>{statusIcon[item.status]}</span>
                          <span className="text-sm font-semibold">{item.title} <span className="cursor-help text-slate-600" title={`Weging: maximaal ${item.maxPoints} punten. N.v.t. en niet te bevestigen tellen niet mee in de score.`}>ⓘ</span></span>
                          <span className="ml-auto text-[10px] text-slate-600">{item.status==="not_applicable"?ar.na:item.status==="unable_to_confirm"?ar.unknown:`${item.points}/${item.maxPoints}`}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.message}</p>
                        {item.status !== "pass" && (
                          <div className="mt-3 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.04] p-3">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">{ar.recommendation}</div>
                            <p className="mt-1 text-xs leading-5 text-slate-300">{item.fix}</p>
                            {item.issue_status !== "NOT_APPLICABLE" && item.issue_status !== "UNABLE_TO_CONFIRM" && (
                              <button type="button" onClick={() => generateFix(item)} disabled={fixing === (item.issue_id || item.key)} className="mt-2 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10 disabled:opacity-50">
                                {fixing === (item.issue_id || item.key) ? ar.analyzing : ar.fixProposal}
                              </button>
                            )}
                            {fixes[item.issue_id || item.key] && (
                              <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">{fixes[item.issue_id || item.key].title}</div>
                                <div className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">{fixes[item.issue_id || item.key].content}</div>
                                <p className="mt-2 text-xs text-slate-500">{fixes[item.issue_id || item.key].reason}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button type="button" onClick={() => copyFix(item.issue_id || item.key)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-950">{copied === (item.issue_id || item.key) ? "Gekopieerd ✓" : "Gebruik deze tekst"}</button>
                                  <button type="button" onClick={() => createGithubFix(item)} disabled={githubFixing === (item.issue_id || item.key)} className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-50">{githubFixing === (item.issue_id || item.key) ? "Bezig…" : "Fix veilig klaarzetten →"}</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </details>

              <details className="rounded-3xl border border-slate-200 bg-slate-50">
                <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-300">
                  <span className="mr-2">⌄</span> {ar.metrics}
                </summary>
                <div className="grid grid-cols-2 gap-3 border-t border-slate-200 px-5 py-4 sm:grid-cols-3">
                  {[
                    ["H1", result.metrics.h1Count],
                    [ar.words, result.metrics.wordCount],
                    [ar.images, result.metrics.imageCount],
                    [ar.internalLinks, result.metrics.internalLinks],
                    ["JSON-LD", result.metrics.jsonLdBlocks],
                    ["Schema types", result.metrics.schemaTypes.length],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/5 bg-black/10 p-3">
                      <div className="text-xs text-slate-500">{label}</div>
                      <div className="mt-1 text-lg font-bold">{value}</div>
                    </div>
                  ))}
                </div>
              </details>

              <div className="rounded-3xl border border-emerald-400/10 bg-emerald-400/[0.04] p-5">
                <div className="text-xs font-semibold uppercase tracking-widest text-emerald-300">{ar.action}</div>
                <div className="mt-1 text-lg font-black">{issues.length} {issues.length === 1 ? ar.improvement : ar.improvements} {ar.review}</div>
                <p className="mt-1 text-sm leading-5 text-slate-500">Bekijk per verbeterpunt of RankFix een concreet fixvoorstel kan maken. Een voorstel wijzigt je live website niet; scan opnieuw na het publiceren om het resultaat te controleren.</p>
              </div>
            </div>
          </div>
        </section>
        )
      )}

      <section id="features" className="mx-auto max-w-7xl scroll-mt-8 border-t border-slate-200 px-5 py-20 lg:px-8">
        <div className="max-w-2xl">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{pc.featuresEyebrow}</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{pc.featuresTitle}</h2>
          <p className="mt-4 text-slate-600">{pc.featuresIntro}</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {pc.cards.map(([title, text], index) => {
            const number = String(index + 1).padStart(2, "0");
            return (
            <div key={number} className="group rounded-3xl border border-slate-200 bg-slate-50 p-7 transition hover:-translate-y-1 hover:bg-white">
              <div className="text-xs font-black text-emerald-300">{number}</div>
              <h3 className="mt-10 text-xl font-bold">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">{text}</p>
            </div>
          )})}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white/[0.02]"><div className="mx-auto max-w-7xl px-5 py-16 lg:px-8"><div className="max-w-2xl"><div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{xc.fairLabel}</div><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{xc.fairTitle}</h2><p className="mt-4 text-slate-500">{xc.fairIntro}</p></div><div className="mt-10 grid gap-4 md:grid-cols-4">{xc.fair.map(([icon,title,text])=><div key={title} className="rounded-3xl border border-slate-200 bg-slate-50 p-6"><div className="text-2xl">{icon}</div><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div></section>

      <section id="pricing" className="mx-auto max-w-7xl scroll-mt-8 border-t border-slate-200 px-5 py-20 lg:px-8">
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{pc.pricingLabel}</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{pc.pricingTitle}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-500">{pc.pricingIntro}</p>
        </div>
        <div className="mx-auto mt-10 grid max-w-7xl gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(language==="nl"?[
            ["Gratis","€ 0,00",pc.trial,["1 website","2 volledige scans / maand","SEO + GEO basis","Actiepunten","Geen AI-fix"]],
            ["Start","€ 34,95",pc.perMonth,["1 website","15 scans / maand","AI-fixes inbegrepen","SEO + GEO + Security + Accessibility","PDF-rapport downloaden","3 maanden scanhistorie","Extra capaciteit los bijkopen"]],
            ["Business","€ 69,95",pc.perMonth,["5 websites","50 scans / maand","AI-fixes inbegrepen","24/7 monitoring","Kritieke waarschuwingen per e-mail","Health Guard + Security monitoring","Search Console, Consent Mode & Local SEO","12 maanden scanhistorie","Extra capaciteit los bijkopen"]],
            ["E-commerce","€ 89,95",pc.perMonth,["5 webshops","75 scans / maand","2 gebruikers","Alles van Business","24/7 monitoring + kritieke e-mailalerts","Shopify, WooCommerce & Next.js/custom","Product-, categorie- & structured-data checks","Merchant Readiness + EU-Omnibus checks","Extra capaciteit los bijkopen"]],
            ["Pro","€ 129,95",pc.perMonth,["15 websites","150 scans / maand","Tot 5 gebruikers","AI-fixes inbegrepen","24/7 monitoring + kritieke e-mailalerts","Uitgebreide automatisering","Concurrentiechecks","Extra capaciteit los bijkopen"]],
            ["Agency","€ 219,95",pc.perMonth,["50 websites","500 scans / maand","Meerdere gebruikers","AI-fixes inbegrepen","24/7 monitoring + kritieke e-mailalerts","Klant- en agencyrapportage","API + team/workflow","White-label voorbereid","Extra capaciteit los bijkopen"]]
          ]:language==="en"?[
            ["Free","€0.00",pc.trial,["1 website","2 full scans / month","SEO + GEO basics","Action items","No AI fix"]],
            ["Start","€34.95",pc.perMonth,["1 website","15 scans / month","AI fixes included","SEO + GEO + Security + Accessibility","PDF report download","3 months scan history","Buy extra capacity separately"]],
            ["Business","€69.95",pc.perMonth,["5 websites","50 scans / month","AI fixes included","24/7 monitoring","Critical email alerts","Health Guard + Security monitoring","Search Console, Consent Mode & Local SEO","12 months scan history","Buy extra capacity separately"]],
            ["E-commerce","€89.95",pc.perMonth,["5 online stores","75 scans / month","2 users","Everything in Business","24/7 monitoring + critical email alerts","Shopify, WooCommerce & Next.js/custom","Product, category & structured-data checks","Merchant Readiness + EU-Omnibus checks","Buy extra capacity separately"]],
            ["Pro","€129.95",pc.perMonth,["15 websites","150 scans / month","Up to 5 users","AI fixes included","24/7 monitoring + critical email alerts","Advanced automation","Competitor checks","Buy extra capacity separately"]],
            ["Agency","€219.95",pc.perMonth,["50 websites","500 scans / month","Multiple users","AI fixes included","24/7 monitoring + critical email alerts","Client & agency reporting","API + team/workflow","White-label ready","Buy extra capacity separately"]]
          ]:language==="de"?[
            ["Kostenlos","0,00 €",pc.trial,["1 Website","2 vollständige Scans / Monat","SEO + GEO Basis","Maßnahmen","Kein AI-Fix"]],
            ["Start","34,95 €",pc.perMonth,["1 Website","15 Scans / Monat","AI-Fixes inklusive","SEO + GEO + Security + Accessibility","PDF-Bericht herunterladen","3 Monate Scan-Verlauf","Zusätzliche Kapazität separat hinzubuchen"]],
            ["Business","69,95 €",pc.perMonth,["5 Websites","50 Scans / Monat","AI-Fixes inklusive","24/7 Monitoring","Kritische E-Mail-Warnungen","Health Guard + Security Monitoring","Search Console, Consent Mode & Local SEO","12 Monate Scan-Verlauf","Zusätzliche Kapazität separat hinzubuchen"]],
            ["E-commerce","89,95 €",pc.perMonth,["5 Onlineshops","75 Scans / Monat","2 Nutzer","Alles aus Business","24/7 Monitoring + kritische E-Mail-Warnungen","Shopify, WooCommerce & Next.js/custom","Produkt-, Kategorie- & Structured-Data-Prüfungen","Merchant Readiness + EU-Omnibus-Prüfungen","Zusätzliche Kapazität separat hinzubuchen"]],
            ["Pro","129,95 €",pc.perMonth,["15 Websites","150 Scans / Monat","Bis zu 5 Nutzer","AI-Fixes inklusive","24/7 Monitoring + kritische E-Mail-Warnungen","Erweiterte Automatisierung","Wettbewerber-Checks","Zusätzliche Kapazität separat hinzubuchen"]],
            ["Agency","219,95 €",pc.perMonth,["50 Websites","500 Scans / Monat","Mehrere Nutzer","AI-Fixes inklusive","24/7 Monitoring + kritische E-Mail-Warnungen","Kunden- und Agenturberichte","API + Team/Workflow","White-Label vorbereitet","Zusätzliche Kapazität separat hinzubuchen"]]
          ]:language==="fr"?[
            ["Gratuit","0,00 €",pc.trial,["1 site web","2 audits complets / mois","SEO + GEO de base","Points d'action","Pas de correctif IA"]],
            ["Start","34,95 €",pc.perMonth,["1 site web","15 scans / mois","Correctifs IA inclus","SEO + GEO + Security + Accessibility","Téléchargement du rapport PDF","3 mois d'historique des scans","Acheter séparément de la capacité supplémentaire"]],
            ["Business","69,95 €",pc.perMonth,["5 sites web","50 scans / mois","Correctifs IA inclus","Surveillance 24/7","Alertes e-mail critiques","Health Guard + Security monitoring","Search Console, Consent Mode & SEO local","12 mois d'historique des scans","Acheter séparément de la capacité supplémentaire"]],
            ["E-commerce","89,95 €",pc.perMonth,["5 boutiques en ligne","75 scans / mois","2 utilisateurs","Tout ce qui est inclus dans Business","Surveillance 24/7 + alertes e-mail critiques","Shopify, WooCommerce & Next.js/custom","Contrôles produit, catégorie & données structurées","Contrôles Merchant Readiness + EU-Omnibus","Acheter séparément de la capacité supplémentaire"]],
            ["Pro","129,95 €",pc.perMonth,["15 sites web","150 scans / mois","Jusqu'à 5 utilisateurs","Correctifs IA inclus","Surveillance 24/7 + alertes e-mail critiques","Automatisation avancée","Contrôles de la concurrence","Acheter séparément de la capacité supplémentaire"]],
            ["Agency","219,95 €",pc.perMonth,["50 sites web","500 scans / mois","Plusieurs utilisateurs","Correctifs IA inclus","Surveillance 24/7 + alertes e-mail critiques","Rapports clients et agence","API + équipe/workflow","White-label prêt","Acheter séparément de la capacité supplémentaire"]]
          ]:language==="it"?[
            ["Gratuito","€ 0,00",pc.trial,["1 sito web","2 scansioni complete / mese","SEO + GEO di base","Punti d'azione","Nessun fix AI"]],
            ["Start","€ 34,95",pc.perMonth,["1 sito web","15 scansioni / mese","Fix AI inclusi","SEO + GEO + Security + Accessibility","Download del report PDF","3 mesi di cronologia delle scansioni","Acquista capacità aggiuntiva separatamente"]],
            ["Business","€ 69,95",pc.perMonth,["5 siti web","50 scansioni / mese","Fix AI inclusi","Monitoraggio 24/7","Avvisi e-mail critici","Health Guard + Security monitoring","Search Console, Consent Mode & SEO locale","12 mesi di cronologia delle scansioni","Acquista capacità aggiuntiva separatamente"]],
            ["E-commerce","€ 89,95",pc.perMonth,["5 negozi online","75 scansioni / mese","2 utenti","Tutto ciò che include Business","Monitoraggio 24/7 + avvisi e-mail critici","Shopify, WooCommerce & Next.js/custom","Controlli prodotto, categoria e dati strutturati","Controlli Merchant Readiness + EU-Omnibus","Acquista capacità aggiuntiva separatamente"]],
            ["Pro","€ 129,95",pc.perMonth,["15 siti web","150 scansioni / mese","Fino a 5 utenti","Fix AI inclusi","Monitoraggio 24/7 + avvisi e-mail critici","Automazione avanzata","Controlli della concorrenza","Acquista capacità aggiuntiva separatamente"]],
            ["Agency","€ 219,95",pc.perMonth,["50 siti web","500 scansioni / mese","Più utenti","Fix AI inclusi","Monitoraggio 24/7 + avvisi e-mail critici","Report per clienti e agenzie","API + team/workflow","White-label pronto","Acquista capacità aggiuntiva separatamente"]]
          ]:[
            ["Gratis","0,00 €",pc.trial,["1 sitio web","2 análisis completos / mes","SEO + GEO básico","Puntos de acción","Sin arreglos con IA"]],
            ["Start","34,95 €",pc.perMonth,["1 sitio web","15 análisis / mes","Mejoras con IA incluidas","SEO + GEO + Security + Accessibility","Descarga del informe PDF","3 meses de historial de análisis","Comprar capacidad adicional por separado"]],
            ["Business","69,95 €",pc.perMonth,["5 sitios web","50 análisis / mes","Mejoras con IA incluidas","Monitorización 24/7","Alertas críticas por email","Health Guard + Security monitoring","Search Console, Consent Mode y SEO local","12 meses de historial de análisis","Comprar capacidad adicional por separado"]],
            ["E-commerce","89,95 €",pc.perMonth,["5 tiendas online","75 análisis / mes","2 usuarios","Todo lo incluido en Business","Monitorización 24/7 + alertas críticas por email","Shopify, WooCommerce & Next.js/custom","Controles de producto, categoría y datos estructurados","Controles de Merchant Readiness + EU-Omnibus","Comprar capacidad adicional por separado"]],
            ["Pro","129,95 €",pc.perMonth,["15 sitios web","150 análisis / mes","Hasta 5 usuarios","Mejoras con IA incluidas","Monitorización 24/7 + alertas críticas por email","Automatización avanzada","Controles de competencia","Comprar capacidad adicional por separado"]],
            ["Agency","219,95 €",pc.perMonth,["50 sitios web","500 análisis / mes","Varios usuarios","Mejoras con IA incluidas","Monitorización 24/7 + alertas críticas por email","Informes para clientes y agencias","API + equipo/workflow","White-label preparado","Comprar capacidad adicional por separado"]]
          ]).map((entry)=>{const [name,price,period,items]=entry as [string,string,string,string[]];const featured=name==="Business";const ecommerce=name==="E-commerce";return <div key={name} className={`relative rounded-3xl border p-7 ${featured?"border-emerald-400/40 bg-emerald-400/[0.06]":ecommerce?"border-cyan-400/30 bg-cyan-400/[0.04]":"border-slate-200 bg-slate-50"}`}>{featured&&<div className="absolute right-5 top-5 rounded-full bg-emerald-300 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-slate-950">{pc.chosen}</div>}{ecommerce&&<div className="absolute right-5 top-5 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-200">{pc.forStores}</div>}<div className="text-sm font-bold">{name}</div><div className="mt-5 text-4xl font-black">{price}</div><div className="mt-1 text-xs text-slate-500">{period}</div><div className="my-6 h-px bg-white/10"/><ul className="space-y-3 text-sm text-slate-600">{items.map(item=><li key={item}>✓ {item}</li>)}</ul>{["Free","Gratis","Kostenlos","Gratuit","Gratuito"].includes(name)?<Link href="#scan" className="mt-7 block w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold transition hover:bg-slate-50">{pc.freeScan}</Link>:<Link href={`/checkout?plan=${name.toLowerCase()}&lang=${language}`} className="mt-7 block w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold transition hover:bg-slate-50">{pc.choose} {name} →</Link>}</div>})}
        </div>
        <details className="group mx-auto mt-12 max-w-7xl overflow-hidden rounded-3xl border border-sky-200 bg-sky-50/50 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-gradient-to-r from-blue-950 via-blue-900 to-cyan-900 px-5 py-4 text-white transition hover:from-blue-900 hover:via-blue-800 hover:to-cyan-800 group-open:from-blue-950 group-open:via-blue-900 group-open:to-cyan-900 [&::-webkit-details-marker]:hidden">
            <div>
              <h3 className="text-xl font-black text-white">{language==="nl"?"Vergelijk de pakketten":language==="en"?"Compare plans":language==="de"?"Pakete vergleichen":language==="fr"?"Comparer les offres":language==="it"?"Confronta i piani":"Comparar planes"}</h3>
              <p className="mt-1 text-xs text-blue-100">{language==="nl"?"Bekijk alle functies en verschillen per abonnement.":language==="en"?"View all features and differences for each plan.":language==="de"?"Alle Funktionen und Unterschiede der Pakete anzeigen.":language==="fr"?"Voir toutes les fonctionnalités et différences par offre.":language==="it"?"Visualizza tutte le funzioni e le differenze per piano.":"Consulta todas las funciones y diferencias de cada plan."}</p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-300/40 bg-white/10 text-xl font-bold text-cyan-100 transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="border-t border-sky-200 bg-white p-4 text-sm text-slate-500">{language==="nl"?"Op mobiel kun je de tabel horizontaal schuiven.":language==="en"?"On mobile, swipe the table horizontally.":language==="de"?"Auf Mobilgeräten kannst du die Tabelle horizontal scrollen.":language==="fr"?"Sur mobile, faites défiler le tableau horizontalement.":language==="it"?"Su mobile, scorri la tabella orizzontalmente.":"En móvil, desplaza la tabla horizontalmente."}</div>
          <div className="overflow-x-auto bg-white">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-slate-50"><tr><th className="p-4">{language==="nl"?"Functie":language==="en"?"Feature":language==="de"?"Funktion":language==="fr"?"Fonction":language==="it"?"Funzione":"Función"}</th>{[["Gratis","€0"],["Start","€34,95"],["Business","€69,95"],["E-commerce","€89,95"],["Pro","€129,95"],["Agency","€219,95"]].map(([n,p])=><th key={n} className="p-4">{n}<div className="mt-1 text-xs font-normal text-slate-500">{p}</div></th>)}</tr></thead>
              <tbody>{[
                [language==="nl"?"Websites / webshops":language==="en"?"Websites / stores":language==="de"?"Websites / Shops":language==="fr"?"Sites / boutiques":language==="it"?"Siti / negozi":"Sitios / tiendas","1","1","5","5","15","50"],
                [language==="nl"?"Scans / maand":language==="en"?"Scans / month":language==="de"?"Scans / Monat":language==="fr"?"Scans / mois":language==="it"?"Scansioni / mese":"Análisis / mes","2","15","50","75","150","500"],
                [language==="nl"?"Gebruikers":language==="en"?"Users":language==="de"?"Nutzer":language==="fr"?"Utilisateurs":language==="it"?"Utenti":"Usuarios","1","1","1","2","5",language==="nl"?"Meerdere":language==="en"?"Multiple":language==="de"?"Mehrere":language==="fr"?"Plusieurs":language==="it"?"Multipli":"Varios"],
                [language==="nl"?"SEO + GEO basis":language==="en"?"SEO + GEO basics":language==="de"?"SEO + GEO Basis":language==="fr"?"SEO + GEO de base":language==="it"?"SEO + GEO di base":"SEO + GEO básico","✓","✓","✓","✓","✓","✓"],
                [language==="nl"?"AI-fixes":language==="en"?"AI fixes":language==="de"?"AI-Fixes":language==="fr"?"Correctifs IA":language==="it"?"Fix AI":"Mejoras con IA","—","✓","✓","✓","✓","✓"],
                [language==="nl"?"Security + Accessibility":language==="en"?"Security + Accessibility":language==="de"?"Security + Accessibility":language==="fr"?"Security + Accessibility":language==="it"?"Security + Accessibility":"Security + Accessibility","—","✓","✓","✓","✓","✓"],
                [language==="nl"?"PDF-rapport downloaden":language==="en"?"PDF report download":language==="de"?"PDF-Bericht herunterladen":language==="fr"?"Téléchargement du rapport PDF":language==="it"?"Download del report PDF":"Descarga del informe PDF","—","✓","✓","✓","✓","✓"],
                [language==="nl"?"Scanhistorie":language==="en"?"Scan history":language==="de"?"Scan-Verlauf":language==="fr"?"Historique des scans":language==="it"?"Cronologia scansioni":"Historial de análisis","—","3 mnd","12 mnd","12 mnd","12 mnd","12 mnd"],
                [language==="nl"?"Fix Engine":language==="en"?"Fix Engine":language==="de"?"Fix Engine":language==="fr"?"Fix Engine":language==="it"?"Fix Engine":"Fix Engine","—","✓","✓","✓","✓","✓"],
                ["24/7 monitoring","—","—","✓","✓","✓","✓"],
                [language==="nl"?"Kritieke e-mailwaarschuwingen":language==="en"?"Critical email alerts":language==="de"?"Kritische E-Mail-Warnungen":language==="fr"?"Alertes e-mail critiques":language==="it"?"Avvisi e-mail critici":"Alertas críticas por email","—","—","✓","✓","✓","✓"],
                ["Health Guard + Security monitoring","—","—","✓","✓","✓","✓"],
                [language==="nl"?"Search Console, Consent Mode & Local SEO":language==="en"?"Search Console, Consent Mode & Local SEO":language==="de"?"Search Console, Consent Mode & Local SEO":language==="fr"?"Search Console, Consent Mode & SEO local":language==="it"?"Search Console, Consent Mode & SEO locale":"Search Console, Consent Mode y SEO local","—","—","✓","✓","✓","✓"],
                [language==="nl"?"Webshopcontroles":language==="en"?"Store checks":language==="de"?"Shop-Prüfungen":language==="fr"?"Contrôles e-commerce":language==="it"?"Controlli e-commerce":"Controles e-commerce","—","—","—","✓","✓","✓"],
                [language==="nl"?"Shopify, WooCommerce & Next.js/custom":language==="en"?"Shopify, WooCommerce & Next.js/custom":language==="de"?"Shopify, WooCommerce & Next.js/custom":language==="fr"?"Shopify, WooCommerce & Next.js/custom":language==="it"?"Shopify, WooCommerce & Next.js/custom":"Shopify, WooCommerce & Next.js/custom","—","—","—","✓","✓","✓"],
                [language==="nl"?"Merchant Readiness + EU-Omnibus":language==="en"?"Merchant Readiness + EU-Omnibus":language==="de"?"Merchant Readiness + EU-Omnibus":language==="fr"?"Merchant Readiness + EU-Omnibus":language==="it"?"Merchant Readiness + EU-Omnibus":"Merchant Readiness + EU-Omnibus","—","—","—","✓","✓","✓"],
                [language==="nl"?"Uitgebreide automatisering":language==="en"?"Advanced automation":language==="de"?"Erweiterte Automatisierung":language==="fr"?"Automatisation avancée":language==="it"?"Automazione avanzata":"Automatización avanzada","—","—","—","—","✓","✓"],
                [language==="nl"?"Concurrentiechecks":language==="en"?"Competitor checks":language==="de"?"Wettbewerber-Checks":language==="fr"?"Contrôles de la concurrence":language==="it"?"Controlli della concorrenza":"Controles de competencia","—","—","—","—","✓","✓"],
                [language==="nl"?"Klant- en agencyrapportage":language==="en"?"Client & agency reporting":language==="de"?"Kunden- und Agenturberichte":language==="fr"?"Rapports clients et agence":language==="it"?"Report per clienti e agenzie":"Informes para clientes y agencias","—","—","—","—","—","✓"],
                [language==="nl"?"API + team/workflow":language==="en"?"API + team/workflow":language==="de"?"API + Team/Workflow":language==="fr"?"API + équipe/workflow":language==="it"?"API + team/workflow":"API + equipo/workflow","—","—","—","—","—","✓"],
                [language==="nl"?"White-label":language==="en"?"White-label":language==="de"?"White-Label":language==="fr"?"White-label":language==="it"?"White-label":"White-label","—","—","—","—","—","✓"],
                [language==="nl"?"Extra capaciteit bijkopen":language==="en"?"Buy extra capacity":language==="de"?"Zusätzliche Kapazität":language==="fr"?"Capacité supplémentaire":language==="it"?"Capacità extra":"Capacidad adicional","—","✓","✓","✓","✓","✓"]
              ].map(row=><tr key={String(row[0])} className="border-t border-slate-200"><th className="p-4 font-semibold">{row[0]}</th>{row.slice(1).map((v,i)=><td key={i} className="p-4 text-slate-600">{v}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="border-y border-slate-200 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            {xc.audiences.map(([title, text]) => <div key={title}><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}
          </div>
        </div>
      </section>

      {contactOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md">
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-[#101B2D] p-6 shadow-2xl sm:p-8">
            <button type="button" onClick={() => setContactOpen(false)} aria-label={language==="nl"?"Contactformulier sluiten":language==="de"?"Kontaktformular schließen":language==="fr"?"Fermer le formulaire de contact":language==="it"?"Chiudi il modulo di contatto":language==="es"?"Cerrar el formulario de contacto":"Close contact form"} className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-300 hover:text-violet-700">×</button>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{t.contact}</div>
            <h2 className="mt-2 text-3xl font-black">{t.contactTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">{t.contactText}</p>
            <form onSubmit={handleContact} className="mt-6 space-y-4">
              <input name="name" required placeholder={pc.name} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-600 focus:border-emerald-300/40" />
              <input name="email" required type="email" placeholder={pc.email} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-600 focus:border-emerald-300/40" />
              <input name="company" placeholder={pc.company} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-600 focus:border-emerald-300/40" />
              <textarea name="message" required rows={5} placeholder={pc.message} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-600 focus:border-emerald-300/40" />
              {contactError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{contactError}</div>}
              {contactSent && <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">{t.thanks}</div>}
              <button disabled={contactSending} className="w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-100 disabled:opacity-50">{contactSending ? t.sending : t.send}</button>
            </form>
          </div>
        </div>
      )}

      <section id="resources" className="border-y border-slate-200 bg-white/[0.02] scroll-mt-8">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{t.resources}</div>
            <h2 className="mt-3 text-3xl font-black tracking-tight">{pc.resourcesTitle}</h2>
            <p className="mt-4 text-slate-600">{pc.resourcesIntro}</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {xc.resources.map(([title,text]) => <button key={title} type="button" onClick={() => title === "SEO Audit" ? startAudit("seo") : title === "GEO Audit" ? startAudit("geo") : scrollToSection("scan")} className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-left transition hover:border-emerald-300/30 hover:bg-white/[0.05]"><div className="font-bold">{title}</div><div className="mt-2 text-sm text-slate-500">{text}</div></button>)}
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-16 lg:px-8">
        <div className="max-w-3xl">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{t.about}</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight">{pc.aboutTitle}</h2>
          <p className="mt-4 leading-7 text-slate-300">{pc.about1}</p>
          <p className="mt-4 leading-7 text-slate-600">{pc.about2}</p>
          <Link href={`/${language}/about`} className="mt-6 inline-flex rounded-xl border border-emerald-300/30 px-4 py-3 text-sm font-bold text-emerald-200">{pc.learnMore}</Link>
        </div>
      </section>

      <PublicReviews language={language} />

      <footer id="footer" className="bg-[#16243a] px-5 py-14 text-slate-100 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              <img src="/opengraph-image" alt="RankFix AI logo" className="h-9 w-9 rounded-xl object-cover" loading="lazy" />
              <span className="font-bold">RankFix AI</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">{language==="nl"?"SEO + GEO auditsoftware voor bedrijven en bureaus die willen weten wat ze moeten verbeteren — en het daarna ook willen verbeteren.":language==="en"?"SEO + GEO audit software for businesses and agencies that want to know what to improve — and then improve it.":language==="de"?"SEO- und GEO-Auditsoftware für Unternehmen und Agenturen, die wissen wollen, was sie verbessern müssen — und es dann umsetzen.":language==="fr"?"Logiciel d’audit SEO + GEO pour les entreprises et agences qui veulent savoir quoi améliorer — puis passer à l’action.":language==="it"?"Software di audit SEO + GEO per aziende e agenzie che vogliono sapere cosa migliorare — e poi farlo.":"Software de auditoría SEO + GEO para empresas y agencias que quieren saber qué mejorar — y después mejorarlo."}</p>
            <p className="mt-3 max-w-sm text-xs leading-5 text-slate-400">
              {language==="nl"?"Over RankFix: gespecialiseerd in technische SEO, GEO, structured data en AI-search readiness. Voor vragen over de scan, rapporten of fixes kun je rechtstreeks contact opnemen via het contactformulier.":language==="en"?"About RankFix: specialized in technical SEO, GEO, structured data and AI-search readiness. For questions about scans, reports or fixes, contact RankFix directly through the contact form.":language==="de"?"Über RankFix: spezialisiert auf technisches SEO, GEO, strukturierte Daten und AI-Search-Readiness. Fragen zu Scans, Berichten oder Fixes kannst du direkt über das Kontaktformular stellen.":language==="fr"?"À propos de RankFix : spécialisé en SEO technique, GEO, données structurées et préparation à la recherche IA. Pour toute question sur les audits, rapports ou correctifs, contactez RankFix via le formulaire.":language==="it"?"RankFix è specializzato in SEO tecnico, GEO, dati strutturati e preparazione alla ricerca AI. Per domande su analisi, report o fix, contatta RankFix tramite il modulo.":"RankFix está especializado en SEO técnico, GEO, datos estructurados y preparación para búsquedas con IA. Para preguntas sobre análisis, informes o mejoras, contacta con RankFix mediante el formulario."}
            </p>
          </div>
          {[
            [t.product, language==="nl"?["SEO Audit","GEO Audit","AI Fixes","Rapporten"]:language==="en"?["SEO Audit","GEO Audit","AI Fixes","Reports"]:language==="de"?["SEO-Audit","GEO-Audit","AI-Fixes","Berichte"]:language==="fr"?["Audit SEO","Audit GEO","Correctifs IA","Rapports"]:language==="it"?["Audit SEO","Audit GEO","Fix AI","Report"]:["Auditoría SEO","Auditoría GEO","Mejoras IA","Informes"]],
            [t.forWho, language==="nl"?["Bedrijven","Webshops","Bureaus","SaaS"]:language==="en"?["Businesses","Online stores","Agencies","SaaS"]:language==="de"?["Unternehmen","Onlineshops","Agenturen","SaaS"]:language==="fr"?["Entreprises","Boutiques en ligne","Agences","SaaS"]:language==="it"?["Aziende","Negozi online","Agenzie","SaaS"]:["Empresas","Tiendas online","Agencias","SaaS"]],
            [t.company, language==="nl"?["Over RankFix","Contact","Privacy","Voorwaarden","Cookies"]:language==="en"?["About RankFix","Contact","Privacy","Terms","Cookies"]:language==="de"?["Über RankFix","Kontakt","Datenschutz","AGB","Cookies"]:language==="fr"?["À propos de RankFix","Contact","Confidentialité","Conditions générales","Cookies"]:language==="it"?["Chi è RankFix","Contatti","Privacy","Termini e condizioni","Cookie"]:["Sobre RankFix","Contacto","Privacidad","Condiciones","Cookies"]],
          ].map((entry,groupIndex) => {
            const [title, links] = entry as [string, string[]];
            return <div key={title}><div className="text-sm font-bold text-white">{title}</div><div className="mt-4 space-y-3 text-sm text-slate-300">{links.map((link,index)=>groupIndex===2&&index!==1?<Link key={link} href={`/${language}/${index===0?"about":index===2?"privacy":index===3?"terms":"cookies"}`} className="block text-left hover:text-emerald-300">{link}</Link>:<button type="button" key={link} onClick={()=>{
              if(groupIndex===2)setContactOpen(true);
              else if(groupIndex===0){if(index===0)startAudit("seo");else if(index===1)startAudit("geo");else if(index===2)scrollToSection("features");else scrollToSection(document.getElementById("resultaat")?"resultaat":"scan");}
              else scrollToSection("scan");
            }} className="block text-left hover:text-emerald-300">{link}</button>)}</div></div>;
          })}
        </div>
        <div className="mx-auto mt-10 max-w-7xl border-t border-slate-600 pt-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{language==="nl"?"Herkent en controleert onder andere":language==="de"?"Erkennt und prüft unter anderem":language==="fr"?"Reconnaît et contrôle notamment":language==="it"?"Riconosce e controlla tra gli altri":language==="es"?"Reconoce y comprueba, entre otros":"Recognises and checks, among others"}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3" aria-label="Ondersteunde platformen">
            <div className="flex min-w-[150px] items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3" title="WordPress">
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full border-2 border-white/80 font-serif text-lg font-bold text-white">W</span><span className="text-sm font-bold text-white">WordPress</span>
            </div>
            <div className="flex min-w-[170px] items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3" title="WooCommerce">
              <span aria-hidden="true" className="grid h-8 min-w-10 place-items-center rounded-lg bg-[#96588a] px-1 text-[10px] font-black text-white">Woo</span><span className="text-sm font-bold text-white">WooCommerce</span>
            </div>
            <div className="flex min-w-[145px] items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3" title="Shopify">
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-[#95bf47] text-base font-black text-white">S</span><span className="text-sm font-bold text-white">Shopify</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">{language==="nl"?"Platformherkenning betekent ondersteuning door RankFix; het is geen partner- of certificeringsclaim.":language==="en"?"Platform recognition means RankFix support; it does not imply a partnership or certification.":"RankFix herkent deze platformen; dit betekent geen officiële samenwerking of certificering."}</p>
        </div>
        <div className="mx-auto mt-12 flex max-w-7xl flex-col justify-between gap-3 border-t border-slate-600 pt-6 text-xs text-slate-300 sm:flex-row">
          <span>© 2026 RankFix AI. {language==="nl"?"Alle rechten voorbehouden.":language==="en"?"All rights reserved.":language==="de"?"Alle Rechte vorbehalten.":language==="fr"?"Tous droits réservés.":language==="it"?"Tutti i diritti riservati.":"Todos los derechos reservados."}</span>
          <span>SEO · GEO · AI Search · {language==="nl"?"Onafhankelijk ontwikkeld":language==="de"?"Unabhängig entwickelt":language==="fr"?"Conçu de manière indépendante":language==="it"?"Sviluppato in modo indipendente":language==="es"?"Desarrollado de forma independiente":"Built independently"}</span>
        </div>
      </footer>
      <AiAssistant publicLocale={language} />
      <RootMobileNav locale={language} />
    </main>
  );
}
