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
