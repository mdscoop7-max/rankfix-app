// 31 Oct: a person name used as brand ("Leen Bakker", a furniture webshop) never
// declares the trade its surname names. Real bakeries keep their bakery sector.
const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const product=(i)=>`<div class="product" itemscope itemtype="https://schema.org/Product"><a href="/p/${i}"><span itemprop="name">Boxspring ${i}</span></a><span itemprop="price">${199+i}</span> <button class="add-to-cart">In winkelwagen</button></div>`;
const S={
 "leenbakker.test":{title:"Leen Bakker | Meubels, bedden en raamdecoratie online kopen",desc:"Leen Bakker is dé woonwinkel voor iedereen. Bestel meubels, boxsprings, kasten en gordijnen online of in een van onze winkels.",h1:"Welkom bij Leen Bakker",nav:["Meubels","Bedden","Raamdecoratie","Woonaccessoires","Tuin","Winkels"],body:Array.from({length:8},(_,i)=>product(i)).join("")+'<a href="/winkelwagen">Winkelwagen</a><a href="/checkout">Afrekenen</a>'},
 "bakkerijleen.test":{title:"Bakkerij Leen | Vers brood en gebak",desc:"Ambachtelijke bakkerij in Utrecht: elke dag vers brood, taart en gebak.",h1:"Bakkerij Leen",nav:["Brood","Gebak","Taarten","Openingstijden","Contact"],body:"<p>Onze bakker bakt elke ochtend vers brood.</p>"},
 "jandebakker.test":{title:"Jan de Bakker | Ambachtelijke bakker",desc:"Jan de Bakker is uw warme bakker voor vers brood en gebak in Delft.",h1:"Warme bakker in Delft",nav:["Brood","Gebak","Bestellen","Contact"],body:"<p>Vers brood en taart, elke dag.</p>"},
};
const page=(s)=>`<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${s.title}</title><meta name="description" content="${s.desc}"></head><body><nav>${s.nav.map(n=>`<a href="/${n.toLowerCase()}">${n}</a>`).join("")}</nav><h1>${s.h1}</h1>${s.body}<p>${(s.desc+" ").repeat(12)}</p><footer><a href="/privacy">Privacyverklaring</a><a href="/contact">Contact</a></footer></body></html>`;
globalThis.fetch=async(i)=>{const u=new URL(typeof i==="string"?i:i.url);return S[u.host]&&u.pathname==="/"?new Response(page(S[u.host]),{status:200,headers:{"content-type":"text/html"}}):new Response("nf",{status:404})};
globalThis.__RF_RENDER=async()=>{throw new Error("no")};
const {POST}=await import(ROOT+"/app/api/scan/route.ts"); console.info=()=>{};console.warn=()=>{};console.error=()=>{};
const got={};for(const h of Object.keys(S)){const j=await(await POST(new Request("http://localhost/api/scan",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url:`https://${h}/`,mode:"both",language:"nl"})}))).json();got[h]={sector:j.sectorProfile?.sector,key:j.sectorProfile?.key,type:j.websiteProfile?.websiteType?.value};}
const problems=[];
if(got["leenbakker.test"].sector==="food_local_retail"||got["leenbakker.test"].key==="bakery")problems.push("person-name brand typed as bakery: "+JSON.stringify(got["leenbakker.test"]));
for(const h of ["bakkerijleen.test","jandebakker.test"])if(got[h].sector!=="food_local_retail")problems.push(`real bakery ${h} lost its sector: `+JSON.stringify(got[h]));
for(const p of problems)console.log(" - "+p);console.log("GOT "+JSON.stringify(got));console.log("SCAN_MATRIX_RESULT "+JSON.stringify({total:3,failed:problems.length}));
process.exit(0);
