// Controlled route regression; no live requests, account or browser.
let mode='scripted';
const words='Onze opticien verzorgt oogmetingen en persoonlijk advies over brillen en oogzorg. '.repeat(35);
const scriptTags='<script src="/_next/static/a.js"></script><script src="/b.js"></script><script src="/c.js"></script><script src="/d.js"></script>';
const page=(path)=>{
 const isHome=path==='/';
 const title=isHome?'Glaszicht Opticiens | Opticien en oogzorg':'Oogzorg en service | Glaszicht Opticiens';
 const navWords=isHome&&['scripted','positive'].includes(mode)?words:'';
 const mainWords=navWords?'':words;
 const h1=mode==='positive'||!isHome?'<h1>Glaszicht Opticiens</h1>':'';
 return '<!doctype html><html lang="nl"><head><title>'+title+'</title><meta name="description" content="Glaszicht Opticiens biedt oogmetingen en deskundige oogzorg. Onze opticien helpt u bij brillen, contactlenzen en zichtoplossingen."><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://incomplete.test'+path+'">'+(mode==='static'?'':scriptTags)+'<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@graph':[{'@type':mode==='static'?'Optician':'OnlineStore',name:'Glaszicht Opticiens',url:'https://incomplete.test/'},{'@type':'WebSite',name:'Glaszicht Opticiens',url:'https://incomplete.test/'}]})+'</script></head><body>'+h1+'<nav><a href="/service">Service</a><a href="/over-ons">Over ons</a><a href="/contact">Contact</a>'+(mode==='static'?'':'<a href="/brillen/outlet">Brillen outlet</a><a href="/zonnebrillen/outlet">Zonnebrillen outlet</a>')+'<p>'+navWords+'</p></nav><main><p>'+mainWords+'</p></main></body></html>';
};
globalThis.fetch=async input=>{
 const u=new URL(typeof input==='string'?input:input.url);
 if(['/','/service','/over-ons','/contact'].includes(u.pathname))return new Response(page(u.pathname),{headers:{'content-type':'text/html'}});
 if(u.pathname.includes('/outlet'))throw Object.assign(new Error('FETCH_TIMEOUT'),{code:'FETCH_TIMEOUT'});
 return new Response('not found',{status:404});
};
globalThis.__RF_RENDER=async url=>{
 if(mode!=='rendered')throw new Error('RENDER_TIMEOUT');
 return {html:page(new URL(url).pathname),finalUrl:String(url),elapsedMs:1,requests:1,titlePixelWidth:null,domAccessibility:null,axeReport:null};
};
const {POST}=await import('../../app/api/scan/route.ts');
console.info=console.warn=console.error=()=>{};
const results={};
for(mode of ['scripted','positive','static','rendered']){
 const response=await POST(new Request('http://localhost/api/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://incomplete.test/',mode:'both',language:'nl'})}));
 const j=await response.json();
 results[mode]={http:response.status,success:j.success,rendered:j.rendering?.javascriptExecuted,sector:j.sectorProfile?.key,h1:j.seo?.checks.find(c=>c.key==='h1'),commerce:j.commerceApplicability,sample:j.multiPage?.pageAudits.find(p=>p.type==='homepage')?.evidenceChecks.find(c=>c.key==='h1'),retailChecks:[...(j.seo?.checks||[]),...(j.geo?.checks||[])].filter(c=>['checkout_funnel_static','webshop_trust','merchant_product_readiness','product_schema'].includes(c.key)).map(c=>({key:c.key,status:c.status,message:c.message})),pages:j.multiPage?.pageAudits.map(p=>({url:p.url,type:p.type,status:p.status}))};
}
console.log('INCOMPLETE_RENDER_RESULT '+JSON.stringify(results));
process.exit(0);
