import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {register} from 'node:module';
register('./scan-matrix/loader.mjs',import.meta.url);
const {safePublicFetch}=await import('../lib/safe-fetch.ts');
const {extractImageMetrics}=await import('../lib/image-metrics.ts');
const {findInertOrderButtons,findTestProducts}=await import('../lib/content-integrity.ts');
const {missionOrganisationIdentity,constructionGroupIdentity}=await import('../lib/organisation-identity.ts');
test('P0 cookie isolation: redirect between unrelated co.uk hosts never carries a cookie',async()=>{
 const original=globalThis.fetch;const requests=[];
 try{globalThis.fetch=async(url,options)=>{requests.push({url:String(url),cookie:new Headers(options.headers).get('cookie')});return requests.length===1?new Response('',{status:302,headers:{location:'https://second.co.uk/','set-cookie':'session=qa-value; Secure; Path=/'}}):new Response('ok');};await safePublicFetch('https://first.co.uk/');assert.equal(requests[1].cookie,null);}finally{globalThis.fetch=original;}
});
test('P0 AutoFix: route delegates merging to a required-check gate and contains no direct merge endpoint',()=>{
 const src=readFileSync(new URL('../app/api/github/fix/route.ts',import.meta.url),'utf8');
 assert.match(src,/mergeVerifiedPullRequest/);assert.doesNotMatch(src,/\/pulls\/"\+Number\(pr.number\)\+"\/merge/);
});
test('P0 images: affected elements are a union, not a sum of overlapping errors',()=>{
 const x=extractImageMetrics('<a href="/item"><img src="one.jpg"></a><img src="two.jpg" alt="Red jacket">');assert.equal(x.affectedAltImages,1);
 assert.equal(extractImageMetrics('<img src="border.svg" alt="">').missingAlt,0);
});
test('P0 commerce: delegated JS handlers are not proven broken; paid sample products are not proven placeholders',()=>{
 assert.deepEqual(findInertOrderButtons('<a class="js-buy" href="#">Add to cart</a><script>document.addEventListener("click", e=>{if(e.target.matches(".js-buy"))e.preventDefault()})</script>'),[]);
 assert.deepEqual(findTestProducts({productNames:['Sample'],visibleText:'Order a paid fabric sample before purchasing a full roll.'}),[]);
 assert.ok(findTestProducts({productNames:['Testproduct']}).length);
});
test('P0 identity: customer industries cannot replace a software or consulting identity',()=>{
 assert.equal(missionOrganisationIdentity({title:'Consultancy for charities and conservation organisations',description:'Our consultancy advises charities.',navLabels:['Donate']}).primary,false);
 assert.equal(constructionGroupIdentity({title:'Software for infrastructure projects',description:'Our cloud software helps teams manage projects.'}).primary,false);
 assert.equal(missionOrganisationIdentity({title:'Natuurbescherming',description:'Wij beschermen natuurgebieden.',navLabels:['Doneer','Word lid']}).primary,true);
 assert.equal(constructionGroupIdentity({title:'Bouwgroep voor bouw en infra',description:'Wij realiseren woningbouw en infrastructuurprojecten.'}).primary,true);
});
test('P0 images: separate missing and unnamed images still count as two affected elements',()=>{assert.equal(extractImageMetrics('<img src="one.jpg"><a href="/item"><img src="two.jpg" alt=""></a>').affectedAltImages,2);});
test('P0 reviews: compare only an explicitly linked visible entity and honour schema bestRating',async()=>{const {boundVisibleReviewText,reviewContradictions}=await import('../lib/content-integrity.ts');assert.equal(boundVisibleReviewText('<section>Our company rated 4.9/5</section>','https://site.example/product','https://site.example/product'),null);const bound=boundVisibleReviewText('<section data-review-entity="https://site.example/product">Product rated 4.1/5 from 10 reviews</section>','https://site.example/product','https://site.example/product');assert.ok(bound?.includes('4.1/5'));assert.deepEqual(reviewContradictions({schemaRating:7,schemaBestRating:7,visibleRating:5,visibleScale:5}),[]);assert.ok(reviewContradictions({schemaRating:4.1,schemaBestRating:5,visibleRating:4.9,visibleScale:5}).length);});
