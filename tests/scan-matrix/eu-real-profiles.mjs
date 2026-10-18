// Real-world identity fixtures from the EU-81 QA round (issue #151).
// tests/fixtures/eu-real-identity/*.json hold what each live homepage actually
// published on 16 Oct 2026: <title>, meta description, html lang, H1/H2, the
// first navigation labels and the JSON-LD @types. They were read from the live
// pages, not invented. The engine has NO rules for these domains: the hosts
// below are neutral .test names, so only generic identity logic can pass.
//
// "widgets" emulate the commerce-like features the live sites expose (ticket
// fares, a stamp eShop, a bank's voucher shop, a grocery cart). They are what
// made the old engine call carriers, post and banks a "webshop".
import { readFileSync, readdirSync } from "node:fs";

const DIR = new URL("../fixtures/eu-real-identity/", import.meta.url);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const WIDGETS = {
  // Retailers: real product grid with prices and an add-to-cart action.
  products: (cur = "€") => ["Smartphone 128GB", "Lavatrice 9kg", "Smart TV 55"].map((n, i) => `<div class="product-card"><a href="/product/item-${i}">${n}</a><span class="price">${cur} ${199 + i * 100},99</span><form action="/cart/add" method="post"><button>Add to cart</button></form></div>`).join("") + `<a href="/cart">Cart</a> <a href="/checkout">Checkout</a> <a href="/shipping">Shipping</a> <a href="/returns">Returns</a>`,
  // Passenger transport: fares, a booking form and a ticket shop.
  fares: (cur = "€") => `<form action="/booking/search" method="get"><input name="from"><input name="to"><input type="date" name="date"><button>Search</button></form><div class="offer"><span>from ${cur} 19,90</span><a href="/tickets/standard">Book</a></div><div class="offer"><span>from ${cur} 9,90</span><a href="/tickets/saver">Book</a></div><a href="/ticketshop">Ticketshop</a> <a href="/cart">Cart</a> <a href="/checkout">Checkout</a>`,
  // Postal operator: stamps eShop with prices.
  stamps: (cur = "€") => `<div class="product-card"><a href="/eshop/postzegels">Postzegels</a><span>${cur} 1,96</span><form action="/cart/add"><button>In winkelmandje</button></form></div><div class="product-card"><a href="/eshop/verzendetiket">Verzendetiket</a><span>${cur} 7,45</span><form action="/cart/add"><button>In winkelmandje</button></form></div><a href="/eshop">eShop</a> <a href="/winkelmandje">Winkelmandje</a> <a href="/tarieven">Tarieven</a>`,
  // Bank: loyalty/voucher shop and product teasers with amounts.
  bankshop: (cur = "RON") => `<div class="product-card"><a href="/magazin/voucher-50">Voucher cadou</a><span>50 ${cur}</span><button>Cumpără</button></div><div class="product-card"><a href="/magazin/voucher-100">Voucher cadou</a><span>100 ${cur}</span><button>Cumpără</button></div><a href="/magazin">Magazinul</a> <a href="/cos">Coș</a>`,
};

const PLAN = {
  "rtl.json": { host: "lu-portal.test" },
  "unieuro.json": { host: "it-elettronica.test", widgets: ["products"], commerce: true },
  "bcr.json": { host: "ro-banca.test", widgets: ["bankshop"] },
  "oebb.json": { host: "at-bahn.test", widgets: ["fares"] },
  "airbaltic.json": { host: "lv-air.test", widgets: ["fares"] },
  "bpost.json": { host: "be-post.test", widgets: ["stamps"] },
  "vrt.json": { host: "be-omroep.test" },
  "svt.json": { host: "se-tv.test" },
  "rtp.json": { host: "pt-tv.test" },
  "stvr.json": { host: "sk-tv.test" },
  "1177.json": { host: "se-halsa.test" },
  "uniba.json": { host: "sk-univerzita.test" },
  "govcz.json": { host: "portal.gov.test" },
  "billa.json": { host: "at-lebensmittel.test", widgets: ["products"], commerce: true },
};

function build(f, plan) {
  const nav = (f.nav || []).map((t, i) => `<a href="/${i ? `n${i}` : ""}">${esc(t)}</a>`).join(" ");
  const ld = (f.types || []).map((t) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": t, name: f.ogSite || f.title.split(/[|–-]/)[0].trim(), url: "https://__HOST__/" })}</script>`).join("");
  const h1 = (f.h1 || []).map((t) => `<h1>${esc(t)}</h1>`).join("");
  const h2 = (f.h2 || []).map((t) => `<section><h2>${esc(t)}</h2><p>${esc(t)}. ${esc((f.nav || []).slice(0, 12).join(", "))}.</p></section>`).join("");
  const widgets = (plan.widgets || []).map((w) => WIDGETS[w]()).join("");
  return `<!doctype html><html lang="${esc(f.lang || "en")}"><head><meta charset="utf-8"><title>${esc(f.title)}</title>${f.desc ? `<meta name="description" content="${esc(f.desc)}">` : ""}<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="__URL__">${f.ogSite ? `<meta property="og:site_name" content="${esc(f.ogSite)}">` : ""}${ld}</head><body><header><nav>${nav}</nav></header><main>${h1}${h2}${widgets}</main><footer><a href="/privacy">Privacy</a> <a href="/contact">Contact</a> <a href="/cookies">Cookies</a></footer></body></html>`;
}

export function euRealProfiles() {
  const out = [];
  for (const file of readdirSync(DIR).filter((n) => n.endsWith(".json")).sort()) {
    const f = JSON.parse(readFileSync(new URL(file, DIR), "utf8"));
    const plan = PLAN[file];
    if (!plan) continue;
    const expect = [f.expected, ...(f.acceptUnknown ? ["unknown"] : [])];
    // Like the live sites, the root "/" redirects to the landing path the site chose.
    const landing = f.finalPath && f.finalPath !== "/" ? f.finalPath : null;
    out.push({ id: `eu-${file.replace(/\.json$/, "")}`, host: plan.host, path: f.finalPath || "/", ...(landing ? { scanPath: "/", redirectTo: `https://${plan.host}${landing}` } : {}), page: plan.page || "homepage", expect, commerce: Boolean(plan.commerce), raw: build(f, plan), real: f });
  }
  return out;
}

// Synthetic, brand-free EU profiles for languages and sectors that were "Sector
// niet bevestigd" in the EU-81 round, plus negative controls (shops that sell
// tickets, travel goods or financing). Same builder as the real fixtures.
const SYN = [
  { id: "eu-syn-ee-marketplace", host: "ee-pood.test", expect: ["ecommerce"], commerce: true, widgets: ["products"], f: { lang: "et", title: "Suurim e-pood Eestis – elektroonika ja kodumasinad", desc: "Telli elektroonikat, kodumasinaid ja mänguasju meie e-poest. Kiire tarne.", h1: ["E-pood"], h2: ["Pakkumised", "Uued tooted"], nav: ["Elektroonika", "Kodumasinad", "Mänguasjad", "Ostukorv"], types: ["Organization"] } },
  { id: "eu-syn-lt-marketplace", host: "lt-parduotuve.test", expect: ["ecommerce"], commerce: true, widgets: ["products"], f: { lang: "lt", title: "Internetinė parduotuvė – buitinė technika ir elektronika", desc: "Didžiausia internetinė parduotuvė Lietuvoje. Pristatymas į namus.", h1: ["Pasiūlymai"], h2: ["Populiariausi"], nav: ["Elektronika", "Buitinė technika", "Krepšelis"], types: [] } },
  { id: "eu-syn-pl-shop-tickets", host: "pl-sklep.test", expect: ["ecommerce"], notExpect: ["transport_travel", "events_culture"], commerce: true, widgets: ["products"], f: { lang: "pl", title: "Sklep internetowy z elektroniką – laptopy i smartfony", desc: "Kup online laptopy, smartfony i bilety upominkowe. Raty 0%, karta kredytowa, darmowa dostawa.", h1: ["Promocje"], h2: ["Bestsellery"], nav: ["Laptopy", "Smartfony", "Bilety upominkowe", "Koszyk"], types: [] } },
  { id: "eu-syn-pl-airline", host: "pl-linie.test", expect: ["transport_travel"], widgets: ["fares"], f: { lang: "pl", title: "Tanie loty i bilety lotnicze | Polskie Linie Lotnicze", desc: "Zarezerwuj lot online do ponad 80 miejsc docelowych.", h1: ["Zarezerwuj lot"], h2: ["Kierunki"], nav: ["Rezerwacja", "Odprawa", "Moja rezerwacja"], types: [] } },
  { id: "eu-syn-fi-bank", host: "fi-pankki.test", expect: ["financial_services"], widgets: ["bankshop"], f: { lang: "fi", title: "Pankki – lainat, säästäminen ja pankkitili", desc: "Avaa pankkitili, hae lainaa ja luottokortti verkossa.", h1: ["Tervetuloa pankkiin"], h2: ["Asuntolaina", "Säästäminen"], nav: ["Henkilöasiakkaat", "Yritykset", "Verkkopankki"], types: ["Organization"] } },
  { id: "eu-syn-ee-telecom", host: "ee-side.test", expect: ["telecom_technology"], widgets: ["products"], f: { lang: "et", title: "Mobiilside, kiudoptiline internet ja TV", desc: "Mobiilside paketid, kiire internet ja TV koju.", h1: ["Paketid"], h2: ["Mobiilside", "Internet"], nav: ["Mobiil", "Internet", "TV", "E-pood"], types: [] } },
  { id: "eu-syn-pt-energy", host: "pt-energia.test", expect: ["energy_utilities"], f: { lang: "pt", title: "Eletricidade e gás natural para a sua casa", desc: "Contrate eletricidade e gás com o tarifário certo. Fornecedor de energia.", h1: ["Energia para casa"], h2: ["Tarifários"], nav: ["Casa", "Empresas", "Área de cliente"], types: [] } },
  { id: "eu-syn-hu-post", host: "hu-posta.test", expect: ["transport_travel"], widgets: ["stamps"], f: { lang: "hu", title: "Posta – levél- és csomagküldés, bélyeg", desc: "Csomagfeladás, levélküldés és postai szolgáltatások egy helyen.", h1: ["Posta"], h2: ["Csomagkövetés"], nav: ["Csomagküldés", "Levélküldés", "Bélyegek"], types: [] } },
  { id: "eu-syn-lv-news", host: "lv-zinas.test", expect: ["news_media"], f: { lang: "lv", title: "Ziņas | Latvijas sabiedriskie mediji", desc: "Jaunākās ziņas no Latvijas un pasaules.", h1: ["Ziņas"], h2: ["Latvijā", "Pasaulē", "Sports"], nav: ["Ziņas", "Sports", "Kultūra"], types: [] } },
  { id: "eu-syn-de-travelshop", host: "de-koffer.test", expect: ["ecommerce"], notExpect: ["transport_travel"], commerce: true, widgets: ["products"], f: { lang: "de", title: "Reisegepäck online kaufen | Koffer-Shop", desc: "Koffer, Reiserucksäcke und Zugbegleiter-Taschen im Onlineshop. Versandkostenfrei.", h1: ["Koffer"], h2: ["Neuheiten"], nav: ["Koffer", "Rucksäcke", "Warenkorb"], types: [] } },
  { id: "eu-syn-nl-news-traffic", host: "nl-krant.test", expect: ["news_media"], notExpect: ["transport_travel"], f: { lang: "nl", title: "Het laatste nieuws uit de regio | Dagblad", desc: "Regionaal nieuws, verkeer, sport en het weer van de redactie.", h1: ["Nieuws"], h2: ["Verkeer: file op de A2", "Luchthaven: nieuwe vluchten", "Transport en logistiek"], nav: ["Nieuws", "Verkeer", "Luchthaven", "Sport"], types: [] } },
];

// 3.6 (pilot-68 root causes G1–G5): service businesses that expose a shop
// capability (phones with a cart, tariff checkout, listings with prices, a
// donation/gift shop, a pricing checkout, room rates) keep their own sector.
// Own wording, neutral hosts; not copies of pilot sites. Plus a real shop that
// never calls itself a shop: still a webshop, but never "confident" (G1).
const SYN36 = [
  { id: "eu36-da-telecom-shop", host: "dk-tele.test", expect: ["telecom_technology"], notExpect: ["ecommerce"], widgets: ["products"], f: { lang: "da", title: "Køb mobiler, mobilt bredbånd og fibernet | Teleselskab", desc: "Mobilabonnementer, bredbånd og tv til hele familien. Billige familieabonnementer.", h1: ["Abonnementer"], h2: ["Mobil", "Bredbånd", "TV"], nav: ["Mobil", "Bredbånd", "TV", "Kurv"], types: ["Organization"] } },
  { id: "eu36-fi-energy-shop", host: "fi-sahko.test", expect: ["energy_utilities"], notExpect: ["ecommerce"], widgets: ["products"], f: { lang: "fi", title: "Sähköyhtiö kotiin ja yrityksille", desc: "Olemme energiayhtiö. Valitse sähkösopimus ja tilaa aurinkopaneelit.", h1: ["Sähkösopimukset"], h2: ["Kodin sähkö", "Aurinkopaneelit"], nav: ["Koti", "Yritykset", "Ostoskori"], types: ["Organization"] } },
  { id: "eu36-es-realestate-portal", host: "es-pisos.test", expect: ["real_estate"], notExpect: ["ecommerce"], widgets: ["products"], f: { lang: "es", title: "Pisos en venta y alquiler | Portal inmobiliario", desc: "Busca casas y pisos de obra nueva o de segunda mano.", h1: ["Encuentra tu casa"], h2: ["Comprar", "Alquilar"], nav: ["Comprar", "Alquilar", "Obra nueva", "Hipotecas"], types: ["Organization"] } },
  { id: "eu36-nl-charity-shop", host: "nl-hulp.test", expect: ["nonprofit"], notExpect: ["ecommerce"], widgets: ["products"], f: { lang: "nl", title: "Hulporganisatie voor mensen in nood", desc: "Wij bieden noodhulp bij rampen en conflicten. Help je mee? Bekijk ook onze webwinkel.", h1: ["Noodhulp"], h2: ["Doneer", "Word vrijwilliger"], nav: ["Over ons", "Doneren", "Vrijwilligers", "Webwinkel"], types: ["NGO"] } },
  { id: "eu36-en-saas-checkout", host: "en-crm.test", expect: ["saas_b2b"], notExpect: ["ecommerce"], widgets: ["products"], f: { lang: "en", title: "CRM, invoicing and projects in one tool", desc: "Business software that small teams use every day. Start a free trial.", h1: ["Run your business in one tool"], h2: ["Pricing", "Integrations"], nav: ["Product", "Pricing", "Integrations", "Log in"], types: ["SoftwareApplication"] } },
  { id: "eu36-de-hotel-chain", host: "de-hotels.test", expect: ["hospitality"], notExpect: ["unknown", "ecommerce"], f: { lang: "de", title: "Hotels in Berlin und Hamburg", desc: "Moderne Zimmer im Stadtzentrum – jetzt direkt buchen.", h1: ["Unsere Hotels"], h2: ["Zimmer", "Angebote"], nav: ["Hotels", "Zimmer", "Angebote", "Buchen"], types: ["Hotel"] } },
  { id: "eu36-nl-shop-without-shop-words", host: "nl-merk.test", expect: ["ecommerce", "unknown"], maxConf: 84, commerce: true, widgets: ["products"], f: { lang: "nl", title: "Merknaam | Design voor thuis", desc: "Ontdek de nieuwe collectie.", h1: ["Nieuwe collectie"], h2: ["Populair"], nav: ["Wonen", "Keuken", "Sale"], types: ["Organization"] } },
];

export function euSyntheticProfiles() {
  return [...SYN, ...SYN36].map((x) => ({ id: x.id, host: x.host, path: "/", page: "homepage", expect: x.expect, ...(x.notExpect ? { notExpect: x.notExpect } : {}), ...(x.maxConf != null ? { maxConf: x.maxConf } : {}), commerce: Boolean(x.commerce), raw: build(x.f, { widgets: x.widgets }) }));
}

// Blind hold-out (tests/fixtures/eu-holdout): measured by the benchmark, not
// part of the CI pass/fail matrix, so it can never be "made to pass" silently.
export function euHoldoutProfiles(file = "holdout.json") {
  const doc = JSON.parse(readFileSync(new URL(`../fixtures/eu-holdout/${file}`, import.meta.url), "utf8"));
  return doc.sites.map((x) => ({
    id: x.id, host: x.host || `${x.id}.test`, path: "/", holdout: true,
    expect: [x.expected, ...(x.alsoOk || []), ...(x.acceptUnknown ? ["unknown"] : [])], commerce: Boolean(x.commerce),
    raw: build({ lang: x.lang, title: x.title, desc: x.desc, h1: x.h1, h2: x.h2, nav: x.nav, types: x.types }, { widgets: x.widgets }),
  }));
}
