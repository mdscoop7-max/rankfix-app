import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site-url";
import { rankfixUserAgents } from "@/lib/evidence-quality";

// Info page linked from every RankFix user agent (review Oct 2026, point 12), so a
// site owner who sees RankFixBot in the logs or blocks it knows what it is.
export const metadata: Metadata = {
  title: "RankFixBot — wat is het en hoe sta je het toe? | RankFix AI",
  description: "RankFixBot en RankFixBrowser halen pagina's op voor een SEO- en GEO-scan die de website-eigenaar of een klant zelf start. Zo herken je de bot en sta je hem toe.",
  alternates: { canonical: "/bot" },
};

export default function BotInfoPage() {
  const agents = rankfixUserAgents(SITE_URL);
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 16px", lineHeight: 1.6 }}>
      <h1>RankFixBot en RankFixBrowser</h1>
      <p>
        RankFix haalt pagina&apos;s op wanneer iemand een SEO- en GEO-scan van een website start. De scan leest alleen
        openbare pagina&apos;s, volgt geen formulieren of betaalflows en probeert geen beveiliging te omzeilen.
      </p>
      <h2>Herkennen</h2>
      <ul>
        <li><code>{agents.bot}</code> voor gewone HTTP-verzoeken (pagina, robots.txt, sitemap en een begrensde steekproef van interne links).</li>
        <li><code>{agents.browser}</code> voor één begrensde browserweergave wanneer een pagina haar inhoud met JavaScript laadt.</li>
      </ul>
      <h2>Wat de scan doet</h2>
      <ul>
        <li>Eén scan haalt de gekozen pagina op, robots.txt, de sitemap, maximaal 16 interne links, maximaal 3 taalversies en maximaal 30 representatieve pagina&apos;s.</li>
        <li>Bij HTTP 429 wacht RankFix volgens <code>Retry-After</code> en probeert hooguit twee keer opnieuw.</li>
        <li>CAPTCHA&apos;s, bot-beveiliging en firewalls worden niet omzeild. Bij HTTP 403 of 418 probeert RankFix één keer een gewone browserweergave; lukt dat niet, of geeft de site HTTP 429, dan krijgt de klant de melding dat de website de scan blokkeert en wordt er geen score berekend.</li>
      </ul>
      <h2>Toestaan of blokkeren</h2>
      <p>
        Wil je de scan toestaan, sta dan de user-agents hierboven toe in je firewall of bot-beveiliging. Wil je geen scans,
        blokkeer ze dan daar; de scan stopt dan zonder score. Vragen? Neem contact op via{" "}
        <a href="/nl/contact">de contactpagina</a>.
      </p>
      <h2>English</h2>
      <p>
        RankFixBot and RankFixBrowser fetch public pages when someone starts an SEO and GEO scan of a website. They never
        submit forms, run checkout flows or bypass bot protection. To allow scans, allow the user agents above in your firewall.
      </p>
    </main>
  );
}
