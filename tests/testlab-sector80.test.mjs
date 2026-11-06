import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('./fixtures/testlab-144/catalog-sector-80-20261106.json',import.meta.url),'utf8'));
test('sector80 has 80 unique sites and 80 sector groups',()=>{
 assert.equal(catalog.id,'sector80');assert.equal(catalog.sites.length,80);
 assert.equal(new Set(catalog.sites.map(s=>s.hosts[0])).size,80);
 assert.equal(new Set(catalog.sites.map(s=>s.group)).size,80);
 assert.ok(catalog.sites.every(s=>s.hosts.length===1 && s.expected && s.reviewStatus==='proposed_not_independently_verified'));
});
test('payment services include PayPal without assigning it to retail',()=>{
 const paypal=catalog.sites.find(s=>s.hosts[0]==='paypal.com');
 assert.ok(paypal);assert.equal(paypal.expected,'payment_services');
 assert.notEqual(paypal.expected,'ecommerce');
});
