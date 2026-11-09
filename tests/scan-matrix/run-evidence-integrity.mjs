// Controlled response regressions only; not recorded website evidence.
const seen={};
const ordinary='<html><head><title>Informatie over onze dienstverlening</title></head><body><h1>Onze dienstverlening</h1><p>'+('Wij leveren onderhoud en ondersteunen onze klanten met advies. '.repeat(40))+'</p></body></html>';
const challenge='<html><head><title>Just a moment...</title></head><body>Checking your browser before accessing. Cloudflare Ray ID: 8a1b2c3d4e5f</body></html>';
const softServer='<html><head><title>Internal Server Error</title></head><body>An error occurred. Internal Server Error. Try again later.</body></html>';
const paths=['sample-challenge','unstable','soft-server','missing',...Array.from({length:13},(_,i)=>'p'+i)];
const home='<!doctype html><html lang="nl"><head><title>Installatiebedrijf West | Onderhoud</title><meta name="description" content="Ons installatiebedrijf verzorgt installatie en onderhoud van verwarmingssystemen."></head><body><h1>Installatiebedrijf West</h1><nav>'+paths.map(p=>'<a href="/'+p+'">'+p+'</a>').join('')+'</nav><p>'+('Wij installeren en onderhouden verwarmingssystemen met onze monteurs. '.repeat(40))+'</p></body></html>';
const html=(body,status=200)=>new Response(body,{status,headers:{'content-type':'text/html'}});
globalThis.fetch=async input=>{
 const u=new URL(typeof input==='string'?input:input.url);seen[u.pathname]=(seen[u.pathname]||0)+1;
 if(u.pathname==='/')return html(home);
 if(u.pathname==='/sample-challenge')return html(challenge,404);
 if(u.pathname==='/unstable'){if(seen[u.pathname]===1)throw new TypeError('fetch failed');return html(ordinary,500);}
 if(u.pathname==='/soft-server')return html(softServer);
 if(u.pathname==='/missing')return html('<html><head><title>Pagina niet gevonden</title></head><body>De pagina bestaat niet.</body></html>',404);
 if(/^\/p\d+$/.test(u.pathname))return html(ordinary);
 throw new TypeError('not part of this controlled response test');
};
globalThis.__RF_RENDER=async()=>{throw new Error('RENDER_UNAVAILABLE_IN_MATRIX');};
const {POST}=await import('../../app/api/scan/route.ts');console.info=console.warn=console.error=()=>{};
const j=await(await POST(new Request('http://localhost/api/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://integrity.test/',mode:'both',language:'nl'})}))).json();
const c=j.seo?.checks.find(c=>c.key==='broken_links');
console.log('INTEGRITY_RESULT '+JSON.stringify({sampleChallenge:j.multiPage?.pageAudits.find(p=>new URL(p.url).pathname==='/sample-challenge'),links:Object.fromEntries((c?.links||[]).map(l=>[new URL(l.url).pathname,l])),seen}));
