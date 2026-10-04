// Dutch draft based on cookies set by the current application.
export const cookiesContent = {
  title: "Cookieverklaring RankFix AI",
  version: "Versie 4.0 — Laatst bijgewerkt: juni 2026 · Juridisch concept voor de commerciële productfase.",
  intro: [
    "Bij RankFix AI (hierna: ‘wij’, ‘ons’ of ‘het platform’) vinden we transparantie over gegevens belangrijk. Wanneer je de website of de applicatie gebruikt, kan de app noodzakelijke cookies op je apparaat plaatsen.",
    "Hier lees je welke cookies de huidige app gebruikt, waarvoor ze dienen en hoe je ze kunt beheren. We werken dit overzicht bij als er nieuwe functies of diensten bijkomen."
  ],
  sections: [
    { heading: "1. Wat zijn cookies?", paragraphs: ["Cookies zijn kleine tekstbestanden die een website in je browser opslaat. Ze kunnen bijvoorbeeld je aanmeldsessie behouden of een tijdelijke beveiligingscontrole mogelijk maken. Een cookie is niet op zichzelf ‘veilig’; het doel en de instellingen bepalen hoe de gegevens worden beschermd."] },
    { heading: "2. Welke categorieën gebruiken wij?", bullets: [
      "Strikt noodzakelijke cookies: de app gebruikt deze voor je inlogsessie, je keuze om ingelogd te blijven en de beveiligde GitHub-koppeling. Zonder deze cookies werken de betreffende functies niet. Voor strikt noodzakelijke cookies is in beginsel geen voorafgaande toestemming nodig.",
      "Analytische en prestatiecookies: de huidige app plaatst geen eigen analytische cookies of trackingpixels. Als we die later toevoegen, beoordelen we vooraf welke informatie en toestemming vereist zijn.",
      "Voorkeuren: ingelogde gebruikers bewaren hun gekozen dashboardtaal bij hun account. De huidige app gebruikt daarvoor geen afzonderlijke voorkeurcookie. Er is geen ui_settings-cookie voor thema of taal."
    ] },
    { heading: "3. Overzicht van cookies die de app zelf instelt", table: [
      { category: "Functioneel", name: "rankfix_session", purpose: "Behoud van de beveiligde aanmeldsessie.", retention: "Browsersessie of maximaal 30 dagen bij ‘ingelogd blijven’; de sessie kan tijdens gebruik worden verlengd." },
      { category: "Functioneel", name: "rankfix_remember", purpose: "Onthoudt de keuze om ingelogd te blijven.", retention: "Browsersessie of maximaal 30 dagen bij ‘ingelogd blijven’." },
      { category: "Functioneel", name: "github_oauth_state", purpose: "Beveiliging van de vrijwillige GitHub-koppeling.", retention: "Maximaal 10 minuten." }
    ], closing: ["Stripe en een betaalcheckout zijn momenteel niet aangesloten. De app stelt geen stripe_mid-, session_token- of ui_settings-cookie in. Hostingpartijen kunnen technische gegevens verwerken; hun eventuele eigen cookies moeten voor een definitieve verklaring apart worden gecontroleerd."] },
    { heading: "4. Hoe kun je cookies beheren of uitschakelen?", bullets: [
      "Via je browser kun je cookies bekijken, verwijderen of blokkeren. De precieze stappen verschillen per browser.",
      "Als je noodzakelijke cookies blokkeert, werken inloggen en de GitHub-koppeling mogelijk niet. Via uitloggen kun je je actieve RankFix-sessie beëindigen."
    ], closing: ["De huidige app heeft geen cookiebanner of toestemmingsinstellingen: zij plaatst zelf geen niet-noodzakelijke cookies waarvoor een keuze moet worden vastgelegd. Als zulke cookies later worden toegevoegd, regelen we eerst een passende toestemmings- en intrekkingsmogelijkheid."] },
    { heading: "5. Wijzigingen in deze cookieverklaring", paragraphs: ["We actualiseren deze verklaring wanneer de gebruikte cookies, diensten of toepasselijke regels veranderen. De meest recente versie staat op deze pagina."] }
  ]
};
