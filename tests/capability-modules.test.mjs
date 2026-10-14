import test from "node:test";
import assert from "node:assert/strict";
import { buildScanEvidence } from "../lib/scan-evidence.ts";
import { detectAuditCapabilities } from "../lib/capability-modules.ts";

const scan = (html, url="https://example.test/") =>
  detectAuditCapabilities(buildScanEvidence({url,html,rendered:true}));
const active = (report, module) => report.enabledModules.includes(module);

test("cart alone never enables retail modules (telecom-like site)",()=>{
  const result=scan('<title>Internet mobiel tv abonnement</title><a href="/cart">Winkelwagen</a><p>Glasvezel en sim only</p>');
  for(const module of ["ecommerce","product","merchant","checkout"]) assert.equal(active(result,module),false,module);
});
test("product page with add-to-cart enables commerce but not unverified checkout",()=>{
  const result=scan('<script type="application/ld+json">{"@type":"Product"}</script><button>In winkelwagen</button>','https://example.test/product/phone');
  assert.equal(active(result,"product"),true);
  assert.equal(active(result,"merchant"),true);
  assert.equal(active(result,"checkout"),false);
});
test("checkout needs explicit checkout evidence in addition to commerce",()=>{
  const result=scan('<script type="application/ld+json">{"@type":"Product"}</script><button>In winkelwagen</button><a href="/checkout">Afrekenen</a>','https://example.test/product/phone');
  assert.equal(active(result,"checkout"),true);
});
test("uncertain sites only receive base modules",()=>{
  const result=scan('<h1>Welkom</h1>');
  assert.deepEqual(result.enabledModules,["core_seo","geo","technical","business_identity","quality_trust"]);
});
test("a reservation action enables booking without webshop modules",()=>{
  const result=scan('<a href="/reserveren">Reserveren</a>');
  assert.equal(active(result,"booking_flow"),true);
  assert.equal(active(result,"product"),false);
});
