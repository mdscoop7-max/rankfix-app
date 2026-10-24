// TestLab labels describe subtypes; the engine returns broader primary sectors.
// Keep both comparisons visible. A broad match never proves a subtype.
const labels={
 payments:['financial_services','financial_payments'],banking:['financial_services','financial_banking'],insurance:['financial_services','financial_insurance'],financial_services:['financial_services'],
 healthcare:['health_wellness'],veterinary_animal_care:['health_wellness','veterinary'],
 energy:['energy_utilities'],telecom:['telecom_technology'],logistics:['transport_travel'],travel:['transport_travel','passenger_transport'],retail:['ecommerce'],software:['saas_b2b'],
 legal_services:['professional_services','legal'],architecture_design:['professional_services','architecture_design'],
 charities_nonprofits:['nonprofit','charities_nonprofits'],museums_culture:['events_culture','museum_culture'],
 recruitment_staffing:['recruitment'],
};
// A retail label is also met by a LOCAL retail trade: an optician or pharmacy
// sells goods over the counter (and often online) as part of its own trade, a
// bakery is local food retail. These are reported in their own family; the
// TestLab broad label "retail" must not count them as wrong.
const alsoCompatible={retail:[['health_wellness','optician'],['health_wellness','pharmacy'],['food_local_retail',null]]};
export function compareSector(expected,profile={}) {
 const [sector,key]=labels[expected]||[expected];
 const compatible=profile.sector===sector||(alsoCompatible[expected]||[]).some(([s,k])=>profile.sector===s&&(!k||profile.key===k));
 return {expected,expectedSector:sector,observed:profile.sector||'unknown',sectorMatch:compatible,
  expectedSubtype:key||null,observedSubtype:profile.key||profile.subtype||null,
  subtypeMatch:key?profile.key===key:null,labelStatus:'proposed_not_independently_verified'};
}
export function failureCategory(status,code='') {
 // The target website's own refusals (its 429, its login, its WAF) are site
 // blocks, never a RankFix quota: they must not stop the TestLab run.
 if(/SITE_RATE_LIMITED|HTTP_AUTH_REQUIRED/.test(code))return 'site_blocked';
 if(/WEBSITE_LIMIT|SCAN_LIMIT|QUOTA|RATE_LIMIT/.test(code)||[402,429].includes(status))return 'quota';
 if(/DATABASE|INFRASTRUCTURE/.test(code))return 'infrastructure';
 if(/BLOCKED|CHALLENGE|CAPTCHA|ROBOTS/.test(code))return 'site_blocked';
 // The website served an error or maintenance page instead of its content.
 if(/SITE_ERROR_PAGE|HTTP_NOT_FOUND|HTTP_SERVER_ERROR/.test(code))return 'site_unavailable';
 if([401,403].includes(status))return 'auth';
 if(/TIMEOUT/.test(code))return 'timeout';
 if(status===0||/FETCH_|REDIRECT_LOOP|REDIRECT_LIMIT/.test(code))return 'network';
 if(status===200)return 'invalid_response';
 return status>=500?'server_error':'site_or_input_error';
}
