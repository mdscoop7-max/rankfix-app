'use client';

import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [resultMessage, setResultMessage] = useState('');

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setScanning(true);
    setResultMessage('');

    setTimeout(() => {
      setScanning(false);
      setResultMessage(`Analyse gestart voor: ${url}. Je ontvangt zo de resultaten!`);
    }, 2000);
  };

  return (
    <main className="min-h-screen bg-[#070b19] text-white flex flex-col selection:bg-blue-600 selection:text-white relative overflow-hidden">
      {/* Achtergrond Glow / Sfeer effect */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/15 blur-[140px] rounded-full pointer-events-none -z-10"></div>

      {/* 1. Navigatiebalk */}
      <nav className="w-full max-w-7xl mx-auto flex items-center justify-between py-6 px-6 border-b border-blue-950/40">
        <div className="flex items-center space-x-2">
          <span className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="bg-blue-600 text-white p-1.5 rounded-lg text-sm shadow-md shadow-blue-600/30">AI</span>
            RankFix
          </span>
        </div>
        <div className="hidden md:flex items-center space-x-8 text-sm text-slate-300">
          <a href="#" className="hover:text-white transition">Home</a>
          <a href="#functies" className="hover:text-white transition">Functies</a>
          <a href="#hoe-het-werkt" className="hover:text-white transition">Hoe het werkt</a>
          <a href="#prijzen" className="hover:text-white transition">Prijzen</a>
          <a href="#contact" className="hover:text-white transition">Contact</a>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400 border border-slate-800 px-3 py-1.5 rounded-full hidden sm:inline-block">NL NL</span>
          <a href="#" className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-blue-600/20">
            Start Gratis Scan
          </a>
        </div>
      </nav>

      {/* 2. Hero Sectie (Exact zoals op jouw foto) */}
      <section className="max-w-4xl mx-auto text-center mt-16 md:mt-24 px-4 flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-950/60 border border-blue-800/50 text-blue-400 text-xs font-medium mb-6 shadow-inner">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
          AI-gedreven SEO analyse
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
          Meer klanten via <br />
          <span className="text-white">Google</span> <span className="text-slate-500">—</span> fix jouw SEO nu
        </h1>

        <p className="text-slate-300 text-base md:text-lg max-w-2xl mb-8 leading-relaxed">
          Onze AI scant jouw website en geeft je een gratis rapport met de belangrijkste verbeterpunten.
        </p>

        <div className="flex flex-wrap justify-center gap-6 text-xs md:text-sm text-slate-400 mb-10">
          <span className="flex items-center gap-1.5">✓ Gratis scan</span>
          <span className="flex items-center gap-1.5">✓ Resultaat in 30 sec</span>
          <span className="flex items-center gap-1.5">✓ Geen creditcard</span>
        </div>

        {/* Gratis Scan Formulier */}
        <form onSubmit={handleScan} className="w-full max-w-2xl bg-[#0b132b]/90 border border-blue-900/50 p-2.5 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col sm:flex-row items-center gap-2">
          <input 
            type="url" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://jouwwebsite.nl" 
            required
            className="w-full bg-transparent px-4 py-3 text-white placeholder-slate-500 focus:outline-none text-sm"
          />
          <button 
            type="submit" 
            disabled={scanning}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-medium px-6 py-3 rounded-xl transition duration-200 text-sm whitespace-nowrap shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {scanning ? 'Bezig met scannen...' : 'Gratis SEO scan →'}
          </button>
        </form>

        {resultMessage && (
          <div className="mt-4 p-3 bg-blue-950/80 border border-blue-800 text-blue-300 text-xs rounded-xl animate-fade-in">
            {resultMessage}
          </div>
        )}

        <div className="mt-12 flex items-center gap-2 text-xs text-slate-400">
          <div className="flex text-amber-400 text-sm">★★★★★</div>
          <span>Vertrouwd door 500+ ondernemers</span>
        </div>
      </section>

      {/* 3. Functies Sectie */}
      <section id="functies" className="max-w-6xl mx-auto px-6 py-24 mt-12 border-t border-blue-950/40">
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-4xl font-bold mb-4">Waarom kiezen voor RankFix AI?</h2>
          <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto">Alles wat je nodig hebt om hoger te scoren in de zoekresultaten van Google.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-[#0b132b]/50 border border-blue-900/30 p-8 rounded-2xl hover:border-blue-700/50 transition">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold mb-4">⚡</div>
            <h3 className="text-lg font-semibold mb-2">Bliksemsnelle Analyse</h3>
            <p className="text-slate-400 text-sm leading-relaxed">Binnen 30 seconden een diepgaande scan van technische SEO, snelheid en content.</p>
          </div>
          <div className="bg-[#0b132b]/50 border border-blue-900/30 p-8 rounded-2xl hover:border-blue-700/50 transition">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold mb-4">🎯</div>
            <h3 className="text-lg font-semibold mb-2">Concrete Verbeterpunten</h3>
            <p className="text-slate-400 text-sm leading-relaxed">Geen vage technische taal, maar heldere actiepunten die direct resultaat opleveren.</p>
          </div>
          <div className="bg-[#0b132b]/50 border border-blue-900/30 p-8 rounded-2xl hover:border-blue-700/50 transition">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold mb-4">📈</div>
            <h3 className="text-lg font-semibold mb-2">Hogere Conversie</h3>
            <p className="text-slate-400 text-sm leading-relaxed">Trek meer gerichte bezoekers aan die daadwerkelijk klant worden van jouw bedrijf.</p>
          </div>
        </div>
      </section>

      {/* 4. Prijzen Sectie */}
      <section id="prijzen" className="max-w-5xl mx-auto px-6 py-20 border-t border-blue-950/40 w-full">
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-4xl font-bold mb-4">Eenvoudige en transparante prijzen</h2>
          <p className="text-slate-400 text-sm">Start gratis, upgrade wanneer je klaar bent voor groei.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          <div className="bg-[#0b132b]/40 border border-blue-900/30 p-8 rounded-2xl flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">Starter</h3>
              <p className="text-slate-400 text-xs mb-4">Perfect voor eenmalige checks.</p>
              <div className="text-3xl font-bold mb-6">€0 <span className="text-xs text-slate-400 font-normal">/ eenmalig</span></div>
              <ul className="space-y-3 text-sm text-slate-300 mb-8">
                <li>✓ 1 Website scan</li>
                <li>✓ Basis SEO rapport</li>
                <li>✓ Snelheidstest</li>
              </ul>
            </div>
            <a href="#" className="w-full bg-slate-800 hover:bg-slate-700 text-white text-center py-3 rounded-xl text-sm transition">Huidige Plan</a>
          </div>

          <div className="bg-gradient-to-b from-blue-950/60 to-[#0b132b] border border-blue-600/50 p-8 rounded-2xl flex flex-col justify-between relative shadow-xl shadow-blue-950">
            <div className="absolute -top-3 right-6 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Populair</div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Pro Groei</h3>
              <p className="text-slate-400 text-xs mb-4">Voor ondernemers die structureel willen groeien.</p>
              <div className="text-3xl font-bold mb-6">€29 <span className="text-xs text-slate-400 font-normal">/ maand</span></div>
              <ul className="space-y-3 text-sm text-slate-300 mb-8">
                <li>✓ Onbeperkte website scans</li>
                <li>✓ Geavanceerde AI optimalisaties</li>
                <li>✓ Wekelijkse ranking updates</li>
                <li>✓ Prioriteit support</li>
              </ul>
            </div>
            <a href="#" className="w-full bg-blue-600 hover:bg-blue-500 text-white text-center py-3 rounded-xl text-sm font-medium transition shadow-lg shadow-blue-600/30">Start Pro Trial</a>
          </div>
        </div>
      </section>

      {/* 5. Contact Sectie */}
      <section id="contact" className="max-w-3xl mx-auto px-6 py-20 border-t border-blue-950/40 w-full">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-4xl font-bold mb-4">Heb je vragen?</h2>
          <p className="text-slate-400 text-sm">Neem contact met ons op en we helpen je direct verder.</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); alert('Bedankt voor je bericht! We nemen snel contact op.'); }} className="bg-[#0b132b]/60 border border-blue-950 p-8 rounded-2xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Jouw naam</label>
              <input type="text" required className="w-full bg-[#070b19] border border-blue-900/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="Jan Jansen" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">E-mailadres</label>
              <input type="email" required className="w-full bg-[#070b19] border border-blue-900/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500" placeholder="jan@jouwbedrijf.nl" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Bericht</label>
            <textarea rows={4} required className="w-full bg-[#070b19] border border-blue-900/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" placeholder="Waar kunnen we je mee helpen?"></textarea>
          </div>
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl text-sm transition shadow-lg shadow-blue-600/20">
            Verstuur Bericht
          </button>
        </form>
      </section>

      {/* 6. Footer */}
      <footer className="w-full border-t border-blue-950 bg-[#050814] py-12 px-6 mt-20">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div>
            <span className="text-lg font-bold tracking-tight text-white flex items-center gap-2 mb-4">
              <span className="bg-blue-600 text-white p-1.5 rounded-lg text-xs">AI</span>
              RankFix
            </span>
            <p className="text-slate-400 text-xs leading-relaxed">
              De slimste AI-gedreven SEO tool voor ondernemers die hoger willen scoren in Google.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Product</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><a href="#functies" className="hover:text-white transition">Functies</a></li>
              <li><a href="#prijzen" className="hover:text-white transition">Prijzen</a></li>
              <li><a href="#" className="hover:text-white transition">AI Scanner</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Bedrijf</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li><a href="#" className="hover:text-white transition">Over ons</a></li>
              <li><a href="#contact" className="hover:text-white transition">Contact</a></li>
              <li><a href="#" className="hover:text-white transition">Privacybeleid</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Regio</h4>
            <p className="text-xs text-slate-400 mb-2">Beschikbaar in Nederland & België</p>
            <div className="text-xs text-blue-400 font-medium">✓ 24/7 Automatische Scans</div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto border-t border-blue-950/60 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
          <p>© 2026 RankFix AI. Alle rechten voorbehouden.</p>
          <div className="flex space-x-6 mt-4 sm:mt-0">
            <a href="#" className="hover:text-slate-400 transition">Algemene Voorwaarden</a>
            <a href="#" className="hover:text-slate-400 transition">Privacy</a>
          </div>
        </div>
      </footer>
    </main>
  );
}