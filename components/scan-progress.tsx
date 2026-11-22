"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locales";

// What a running free scan does, in order. The server does not stream progress,
// so the list says what RankFix works through and shows the real elapsed time;
// it never claims a step has finished.
const copy: Record<Locale, { title: string; elapsed: (s: number) => string; parallel: string; steps: string[]; long: string }> = {
  nl: { title: "RankFix scant je website", elapsed: (s) => `${s} s bezig`, parallel: "Snelheid mobiel + desktop wordt tegelijk gemeten via Google PageSpeed.",
    steps: ["Homepage ophalen en controleren", "Links, redirects en sitemap nalopen", "Voorbeeldpagina's beoordelen (producten, contact, voorwaarden)", "SEO-, GEO- en beveiligingscontroles uitvoeren", "Score en verbeterpunten opstellen"],
    long: "Grote websites met veel pagina's kunnen tot 2 minuten duren. Sluit dit venster niet." },
  en: { title: "RankFix is scanning your website", elapsed: (s) => `${s} s elapsed`, parallel: "Mobile + desktop speed is measured at the same time via Google PageSpeed.",
    steps: ["Fetch and check the homepage", "Follow links, redirects and the sitemap", "Assess sample pages (products, contact, terms)", "Run SEO, GEO and security checks", "Build the score and improvements"],
    long: "Large websites with many pages can take up to 2 minutes. Keep this window open." },
  de: { title: "RankFix scannt deine Website", elapsed: (s) => `${s} s vergangen`, parallel: "Mobil- und Desktop-Geschwindigkeit wird gleichzeitig über Google PageSpeed gemessen.",
    steps: ["Startseite abrufen und prüfen", "Links, Weiterleitungen und Sitemap prüfen", "Beispielseiten bewerten (Produkte, Kontakt, AGB)", "SEO-, GEO- und Sicherheitsprüfungen ausführen", "Bewertung und Verbesserungen erstellen"],
    long: "Große Websites mit vielen Seiten können bis zu 2 Minuten dauern. Fenster bitte geöffnet lassen." },
  fr: { title: "RankFix analyse votre site", elapsed: (s) => `${s} s écoulées`, parallel: "La vitesse mobile et ordinateur est mesurée en même temps via Google PageSpeed.",
    steps: ["Récupérer et vérifier la page d’accueil", "Vérifier liens, redirections et sitemap", "Évaluer des pages d’exemple (produits, contact, conditions)", "Exécuter les contrôles SEO, GEO et sécurité", "Établir le score et les améliorations"],
    long: "Les grands sites peuvent prendre jusqu’à 2 minutes. Gardez cette fenêtre ouverte." },
  it: { title: "RankFix sta analizzando il sito", elapsed: (s) => `${s} s trascorsi`, parallel: "La velocità mobile e desktop viene misurata contemporaneamente tramite Google PageSpeed.",
    steps: ["Recuperare e controllare la homepage", "Verificare link, redirect e sitemap", "Valutare pagine di esempio (prodotti, contatti, condizioni)", "Eseguire i controlli SEO, GEO e sicurezza", "Preparare punteggio e miglioramenti"],
    long: "I siti grandi possono richiedere fino a 2 minuti. Tieni aperta questa finestra." },
  es: { title: "RankFix está analizando tu sitio", elapsed: (s) => `${s} s transcurridos`, parallel: "La velocidad móvil y de escritorio se mide a la vez con Google PageSpeed.",
    steps: ["Obtener y revisar la página de inicio", "Revisar enlaces, redirecciones y sitemap", "Evaluar páginas de muestra (productos, contacto, condiciones)", "Ejecutar controles SEO, GEO y de seguridad", "Preparar la puntuación y las mejoras"],
    long: "Los sitios grandes pueden tardar hasta 2 minutos. Mantén esta ventana abierta." },
};

export default function ScanProgress({ locale }: { locale: Locale }) {
  const t = copy[locale] || copy.nl;
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div role="status" aria-live="polite" className="lc-scan-progress">
      <p><strong>{t.title}</strong> · <span className="tabular-nums">{t.elapsed(seconds)}</span></p>
      <ol>{t.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <p className="lc-note">{t.parallel}{seconds >= 45 ? ` ${t.long}` : ""}</p>
    </div>
  );
}
