import { NextResponse } from "next/server";

type FixType = "meta_title" | "meta_description" | "h1" | "faq" | "structured_data";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

function trimTo(value: string, max: number) {
  return value.length <= max ? value : value.slice(0, max - 1).trimEnd() + "…";
}

function makeFix(type: FixType, url: string, current: string, context: { title?: string; h1?: string; description?: string }) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const subject = context.h1 || context.title || host;

  if (type === "meta_title") {
    const base = current.trim() || subject;
    const next = trimTo(`${base} | ${host}`, 60);
    return { title: "Nieuwe meta title", content: next, reason: "Kort, duidelijk en gericht op onderwerp + merk." };
  }

  if (type === "meta_description") {
    const base = subject.replace(/[.!?]+$/, "");
    const next = trimTo(`Ontdek alles over ${base}. Bekijk de belangrijkste informatie, voordelen en praktische antwoorden op één plek. ${host} helpt je direct verder.`, 158);
    return { title: "Nieuwe meta description", content: next, reason: "Maakt het onderwerp concreet en geeft zoekers een duidelijke reden om door te klikken." };
  }

  if (type === "h1") {
    return { title: "Nieuwe H1", content: current.trim() || subject, reason: "Gebruik één duidelijke hoofdboodschap die aansluit op de pagina-intentie." };
  }

  if (type === "faq") {
    return {
      title: "FAQ-blok",
      content: `<section><h2>Veelgestelde vragen over ${escapeHtml(subject)}</h2><h3>Wat is ${escapeHtml(subject)}?</h3><p>${escapeHtml(subject)} wordt op deze pagina helder uitgelegd, inclusief de belangrijkste voordelen en aandachtspunten.</p><h3>Voor wie is dit relevant?</h3><p>Deze informatie is bedoeld voor bezoekers die ${escapeHtml(subject.toLowerCase())} willen begrijpen en een onderbouwde keuze willen maken.</p></section>`,
      reason: "Directe vragen en antwoorden maken de pagina beter scanbaar voor bezoekers en machines."
    };
  }

  return {
    title: "Structured data voorstel",
    content: `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: subject, url }, null, 2)}</script>`,
    reason: "Geeft zoekmachines en andere systemen expliciete context over het type pagina."
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const type = body?.type as FixType;
    const current = typeof body?.current === "string" ? body.current : "";
    const context = body?.context && typeof body.context === "object" ? body.context : {};

    if (!url || !["meta_title", "meta_description", "h1", "faq", "structured_data"].includes(type)) {
      return NextResponse.json({ error: "Ongeldige AI-fix aanvraag." }, { status: 400 });
    }

    const fix = makeFix(type, url, current, context);
    return NextResponse.json({
      success: true,
      mode: "rule_based_fallback",
      provider: "RankFix",
      warning: "Dit is de veilige lokale fix-engine. Een externe AI-provider wordt pas gebruikt nadat de eigenaar een API-key heeft ingesteld.",
      fix,
    });
  } catch {
    return NextResponse.json({ error: "De AI-fix kon niet worden gemaakt." }, { status: 500 });
  }
}
