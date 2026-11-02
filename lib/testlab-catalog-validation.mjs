// Offline validation only. No requests, scans or activation. Evidence formats do
// not establish independent truth by themselves; human source review remains required.
export function normalizeDomain(value){try{const u=new URL(/^[a-z]+:\/\//i.test(String(value))?value:'https://'+value);if(!/^https?:$/.test(u.protocol)||u.username||u.password||u.port)return null;const h=u.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(h)||/\.(?:test|example|invalid|localhost)$/.test(h))return null;return h;}catch{return null;}}
export function baselineDomains(input){
 const rows=Array.isArray(input)?input:input?.sites||input?.results||input?.rows||input?.records;
 if(!Array.isArray(rows)||!rows.length)return null;
 const hosts=new Set();for(const row of rows){const values=typeof row==='string'?[row]:[row?.domain,row?.host,row?.url,row?.scannedUrl,row?.finalUrl,...(Array.isArray(row?.hosts)?row.hosts:[])];for(const v of values)if(v){const h=normalizeDomain(v);if(h)hosts.add(h);}}
 return hosts.size?hosts:null;
}
export function validateMkbCatalog(catalog,baseline,requirements,{verifyEvidence=()=>false}={}){
 const problems=[],old=baselineDomains(baseline),sites=catalog?.sites,counts=Object.fromEntries(Object.keys(requirements.sectors).map(s=>[s,0])),seen=new Set();
 if(!old)problems.push('BASELINE_MISSING_OR_UNSUPPORTED');
 if(!Array.isArray(sites)||sites.length!==requirements.total)problems.push('CATALOG_MUST_HAVE_144_ENTRIES');
 for(const [index,s]of (Array.isArray(sites)?sites:[]).entries()){
  const host=normalizeDomain(s.domain);if(!host){problems.push(`INVALID_DOMAIN:${index}`);continue;}
  if(seen.has(host))problems.push(`DUPLICATE_DOMAIN:${host}`);seen.add(host);
  if(old?.has(host))problems.push(`BASELINE_OVERLAP:${host}`);
  if(!(s.sector in counts))problems.push(`UNKNOWN_SECTOR:${host}`);else counts[s.sector]++;
  if(!s.evidence?.primaryActivityQuote||!s.evidence?.mkbBasis||!s.evidence?.reference||!verifyEvidence(s.evidence,host))problems.push(`REAL_SITE_EVIDENCE_UNVERIFIED:${host}`);
  for(const alias of s.redirectAliases||[]){const h=normalizeDomain(alias);if(!h||old?.has(h)||seen.has(h)&&h!==host)problems.push(`ALIAS_CONFLICT:${host}`);if(h)seen.add(h);}
 }
 for(const [sector,count]of Object.entries(requirements.sectors))if(counts[sector]!==count)problems.push(`SECTOR_COUNT:${sector}:${counts[sector]}/${count}`);
 return {structurallyValid:problems.length===0,activationAllowed:false,independentReviewRequired:true,entryCount:sites?.length||0,counts,problems};
}
