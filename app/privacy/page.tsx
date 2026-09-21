export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-5 py-16 text-slate-200">
      <article className="mx-auto max-w-3xl">
        <a href="/" className="text-sm text-cyan-300">← Terug naar RankFix AI</a>
        <h1 className="mt-8 text-4xl font-black">Privacyverklaring</h1>
        <p className="mt-3 text-sm text-slate-500">Concept voor de productfase. Vul bedrijfsgegevens, bewaartermijnen en verwerkers aan vóór livegang.</p>
        <div className="mt-10 space-y-8 text-sm leading-7 text-slate-400">
          <section><h2 className="text-xl font-bold text-white">1. Welke gegevens</h2><p>RankFix kan URL's, scanresultaten, accountgegevens, gebruiksgegevens en — wanneer een gebruiker die invoert — contact- en bedrijfsinformatie verwerken. Scanresultaten kunnen gegevens bevatten die publiek op de gescande pagina stonden.</p></section>
          <section><h2 className="text-xl font-bold text-white">2. Doeleinden</h2><p>Gegevens worden gebruikt om scans uit te voeren, accounts en abonnementen te beheren, resultaten te bewaren, support te leveren, beveiliging te bewaken en de dienst te verbeteren.</p></section>
          <section><h2 className="text-xl font-bold text-white">3. AI-verwerking</h2><p>Wanneer AI-functies worden gebruikt, kan relevante inhoud van een scan naar een AI-verwerker worden gestuurd om een analyse of voorstel te genereren. Voor de productieomgeving worden de gekozen verwerkers, bewaartermijnen en instellingen transparant vastgelegd.</p></section>
          <section><h2 className="text-xl font-bold text-white">4. Bewaren en verwijderen</h2><p>Gegevens worden niet langer bewaard dan nodig is voor het doel waarvoor ze zijn verzameld, wettelijke verplichtingen en legitieme bedrijfsbelangen. In het dashboard wordt verwijdering van scan- en accountgegevens voorzien.</p></section>
          <section><h2 className="text-xl font-bold text-white">5. Beveiliging</h2><p>We nemen passende technische en organisatorische maatregelen, waaronder toegangscontrole, versleutelde verbindingen en beveiligde opslag. Geen enkel internet­systeem kan absolute veiligheid garanderen.</p></section>
          <section><h2 className="text-xl font-bold text-white">6. Rechten</h2><p>Afhankelijk van de toepasselijke privacywetgeving kunnen gebruikers rechten hebben op inzage, correctie, verwijdering, beperking, bezwaar en dataportabiliteit. De definitieve contactgegevens en verantwoordelijke entiteit worden bij productiepublicatie toegevoegd.</p></section>
          <section><h2 className="text-xl font-bold text-white">7. Cookies</h2><p>Niet-noodzakelijke cookies en vergelijkbare technologieën worden alleen ingezet volgens het dan geldende cookiebeleid en, waar vereist, na toestemming.</p></section>
        </div>
      </article>
    </main>
  );
}
