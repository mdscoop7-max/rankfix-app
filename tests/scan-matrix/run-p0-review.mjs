import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {extractImageMetrics} from '../../lib/image-metrics.ts';
import {findInertOrderButtons,findTestProducts} from '../../lib/content-integrity.ts';
import {missionOrganisationIdentity,constructionGroupIdentity} from '../../lib/organisation-identity.ts';
import {pageIdentityKey} from '../../lib/sample-eligibility.ts';
import {classifyLinkOutcome} from '../../lib/link-audit-rules.ts';
const unit={
 delegatedClick:findInertOrderButtons(`<a class="js-buy" href="#">Add to cart</a><script>document.addEventListener('click',e=>{if(e.target.matches('.js-buy')){e.preventDefault();fetch('/cart/add',{method:'POST'});}});</script>`),
 legalSampleProduct:findTestProducts({productNames:['Sample'],visibleText:'Order a paid fabric sample before purchasing a full roll.'}),
 imageOverlap:extractImageMetrics('<a href="/item"><img src="one.jpg"></a><img src="two.jpg" alt="Red cotton jacket">'),
 descriptionMisreadAsAlt:extractImageMetrics('<img src="one.jpg" data-alt="Red jacket">'),
 coalescedPages:['https://shop.example/products?page=1','https://shop.example/products?page=2','https://shop.example/nl/contact','https://shop.example/it/contact'].map(pageIdentityKey),
 articleCalled404:classifyLinkOutcome({status:200,error:false},'https://example.test/error'),
 deniedLink:classifyLinkOutcome({status:403,error:false},'https://example.test/restricted'),
 ngoAudience:missionOrganisationIdentity({title:'Consultancy for charities and conservation organisations',description:'Our consultancy advises charities about strategy.',navLabels:['Donate']}),
 constructionAudience:constructionGroupIdentity({title:'Software for infrastructure projects',description:'Our cloud software helps teams manage projects.'}),
};
let active,requests=[];
const content='<p>We explain the activities of our organisation and describe the services, contact information and terms that apply to our visitors. Our team provides clear information for customers. Please contact our office for questions about appointments, products or support. We publish this information to help visitors understand our work and find relevant details.</p>'.repeat(5);
const product={"@context":"https://schema.org","@type":"Product",name:'Outdoor jacket',image:'https://probe.example/jacket.jpg',sku:'J-22',offers:{'@type':'Offer',price:'49.00',priceCurrency:'EUR',availability:'https://schema.org/InStock'}};
const cases=[
 {id:'sample-accounting',body:'<a href="/services">Services</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a>'},
 {id:'ngo-consultancy-audience',title:'Consultancy for charities and conservation organisations',description:'Our consultancy advises charities about strategy and supports organisations in developing their work.',headings:'<h1>Consultancy for conservation organisations</h1><h2>Our consultants</h2>',body:'<header><nav><a href="/donate">Donate</a></nav></header>'},
 {id:'construction-software-audience',title:'Software for infrastructure projects',description:'Our cloud software helps teams manage projects with subscriptions and a software dashboard.',headings:'<h1>Software for infrastructure projects</h1><h2>Cloud software features</h2>'},
 {id:'driving-school',title:'Rijschool Lichtpoort autorijlessen en rijbewijs',description:'Onze rijschool verzorgt autorijlessen voor het rijbewijs B. Boek een proefles en bekijk de lespakketten.',headings:'<h1>Rijschool Lichtpoort</h1><h2>Rijlessen en proefles</h2>'},
 {id:'h1-empty-with-valid',headings:'<h1>Plumbing repairs</h1><h1> </h1><h2>Our services</h2>'},
 {id:'h1-identical',headings:'<h1>Plumbing repairs</h1><h1>Plumbing repairs</h1><h2>Our services</h2>'},
 {id:'h1-topic-mismatch',headings:'<h1>Professional football tickets</h1><h2>Plumbing maintenance</h2>'},
 {id:'headings-h2-jump',headings:'<h1>Plumbing repairs</h1><h2>Services</h2><h5>Details</h5><h3> </h3>'},
 {id:'headings-skip-empty',headings:'<h1>Plumbing repairs</h1><h2></h2><h4>Maintenance details</h4><h6>Repairs</h6>'},
 {id:'wrong-title-description',title:'Dental implants and orthodontics',description:'Our dental clinic provides dental implants, orthodontics and surgery for patients. Schedule your dental appointment today.',headings:'<h1>Plumbing repairs</h1><h2>Our plumbing services</h2>'},
 {id:'canonical-conflict',headExtra:'<link rel="canonical" href="https://other.example/republished">'},
 {id:'canonical-syndication',canonical:'https://publisher.example/original-story'},
 {id:'image-double-count',body:'<a href="/item"><img src="/one.jpg"></a><img src="/two.jpg" alt="Red cotton jacket">'},
 {id:'broken-image',body:'<img src="/gone.jpg" alt="Plumbing team at work">'},
 {id:'shop-delegated-button',shop:true,body:`<a class="js-buy" href="#">Add to cart</a><script>document.addEventListener('click',function(e){if(e.target.matches('.js-buy')){e.preventDefault();fetch('/cart/add',{method:'POST'});}});</script>`},
 {id:'legitimate-sample',shop:true,productName:'Sample',body:'<p>Order a paid fabric sample before purchasing a full roll.</p>'},
 {id:'reviews-different-entities',shop:true,rating:{ratingValue:4.1,reviewCount:10},body:'<section aria-label="Company reviews">Our company: Rated 4.9 out of 5 from 100 reviews.</section><section aria-label="Product reviews">This jacket: Rated 4.1 out of 5 from 10 reviews.</section>'},
 {id:'review-scale-seven',shop:true,rating:{ratingValue:7,bestRating:7,reviewCount:100},body:'<p>This jacket Rated 5 out of 5 from 100 reviews.</p>'},
 {id:'googlebot-noindex',headExtra:'<meta name="googlebot" content="noindex">'},
 {id:'noindex-repeated-robots',headExtra:'<meta name="robots" content="index,follow"><meta name="robots" content="noindex">'},
];
function html(c){const canonical=c.canonical||'https://probe.example/';const p={...product,name:c.productName||product.name,...(c.rating?{aggregateRating:{'@type':'AggregateRating',...c.rating}}:{})};return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${c.title|| (c.shop?'Outdoor equipment online shop':'Plumbing services and maintenance')}</title><meta name="description" content="${c.description||'We provide plumbing repairs, installation and maintenance. Read our services and contact our team for an appointment.'}"><link rel="canonical" href="${canonical}"><meta name="viewport" content="width=device-width,initial-scale=1">${c.headExtra||''}${c.shop?'<script type="application/ld+json">'+JSON.stringify(p)+'</script>':''}</head><body><main>${c.headings||'<h1>Plumbing services</h1><h2>Maintenance and repair</h2>'}${content}${c.body||''}${c.shop?'<p>Outdoor jacket € 49.00 EUR. In stock.</p><form action="/cart/add"><button>Add to cart</button></form><a href="/cart">Cart</a><a href="/checkout">Checkout</a>':''}</main></body></html>`;}
globalThis.fetch=async(input,options={})=>{const u=new URL(typeof input==='string'?input:input.url);requests.push({url:u.toString(),method:options.method||'GET'});if(u.pathname==='/')return new Response(html(active),{status:200,headers:{'content-type':'text/html'}});return new Response('Not found',{status:404,headers:{'content-type':'text/html'}});};
globalThis.__RF_RENDER=async()=>{throw new Error('NO_REAL_BROWSER_IN_INDEPENDENT_PROBE')};
const {POST}=await import('../../app/api/scan/route.ts');
const saved={log:console.log,info:console.info,warn:console.warn,error:console.error};console.log=console.info=console.warn=console.error=()=>{};
const outputs=[];
for(const c of cases){active=c;requests=[];const response=await POST(new Request('http://localhost/api/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://probe.example/',mode:'both',language:'nl'})}));const j=await response.json();outputs.push({id:c.id,status:response.status,report:j,requests});}
Object.assign(console,saved);
const {safePublicFetch}=await import('../../lib/safe-fetch.ts');const cookieRequests=[];
globalThis.fetch=async(input,options={})=>{const u=String(input);cookieRequests.push({url:u,cookie:new Headers(options.headers).get('cookie')});return cookieRequests.length===1?new Response('',{status:302,headers:{location:'https://second.co.uk/destination','set-cookie':'session=private-test-value; Path=/; Secure; HttpOnly'}}):new Response('ok',{status:200});};
await safePublicFetch('https://first.co.uk/start');
writeFileSync(process.env.RF_P0_REPORT || join(tmpdir(),'rankfix-p0-route-results.json'),JSON.stringify({unit,cookieRequests,outputs},null,2));
console.log('UNIT',JSON.stringify(unit));console.log('COOKIES',JSON.stringify(cookieRequests));
for(const o of outputs){const all=[...(o.report.seo?.checks||[]),...(o.report.geo?.checks||[])];console.log(o.id,JSON.stringify({status:o.status,sector:o.report.sectorProfile?.sector,checks:all.filter(c=>['h1','headings','title','description','canonical','image_alt','alt','test_content','order_button','review_claims','indexability','robots_meta'].includes(c.key)).map(c=>({key:c.key,status:c.status,points:c.points,max:c.maxPoints,message:c.message})),imageRequest:o.requests.some(x=>x.url.endsWith('/gone.jpg'))}));}
// Acceptance checks preserve the review's negative cases as route regressions.
const problems=[];
const r=id=>outputs.find(o=>o.id===id)?.report;
const ck=(id,key)=>[...(r(id)?.seo?.checks||[]),...(r(id)?.geo?.checks||[])].find(c=>c.key===key);
const require=(ok,label)=>{if(!ok)problems.push(label);};
require(!/precies één H1/.test(ck('h1-empty-with-valid','h1')?.message||''),'empty H1 hidden');
require(ck('h1-identical','h1')?.status!=='fail','multiple H1 automatically failed');
for(const id of ['googlebot-noindex','noindex-repeated-robots'])require(ck(id,'indexability')?.status!=='pass',id);
require(ck('canonical-conflict','canonical')?.status!=='pass','canonical conflict');
require(ck('wrong-title-description','title')?.status!=='pass','metadata mismatch ignored');
require(classifyLinkOutcome({status:403,error:false},'https://example.test/denied')==='unconfirmed','403 marked OK');
require(classifyLinkOutcome({status:404,error:false},'https://example.test/removed')==='broken','404 not detected');
for(const id of ['reviews-different-entities','review-scale-seven'])require(!['warning','fail'].includes(ck(id,'review_claims')?.status),id);
require(extractImageMetrics('<img src="border.svg" alt="">').missingAlt===0,'decorative alt');
require(!ck('image-double-count','alt')?.message.includes('2 van 2'),'image overlap counted twice');
require(cookieRequests[1]?.cookie===null,'cookie crossed host');
require(r('sample-accounting')?.scoreModel?.evidenceLevel==='insufficient','sample double counting');
require(!['warning','fail'].includes(ck('shop-delegated-button','order_button')?.status),'delegated handler');
require(!['warning','fail'].includes(ck('legitimate-sample','test_content')?.status),'retail sample');
require(r('ngo-consultancy-audience')?.sectorProfile?.sector!=='nonprofit','customer charity mistaken for own sector');
require(r('construction-software-audience')?.sectorProfile?.sector==='saas_b2b','software audience mistaken for trade');
for(const p of problems)console.log(' - '+p);
console.log('SCAN_MATRIX_RESULT '+JSON.stringify({total:18,failed:problems.length}));
process.exitCode=problems.length?1:0;
