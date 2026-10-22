// TestLab labels describe subtypes; the engine returns broader primary sectors.
// Keep both comparisons visible. A broad match never proves a subtype.
const labels={payments:['financial_services','financial_payments'],banking:['financial_services','financial_banking'],insurance:['financial_services','financial_insurance'],healthcare:['health_wellness'],energy:['energy_utilities'],telecom:['telecom_technology'],logistics:['transport_travel'],travel:['transport_travel','passenger_transport'],retail:['ecommerce'],software:['saas_b2b']};
export function compareSector(expected,profile={}) {
 const [sector,key]=labels[expected]||[expected];
 return {expected,expectedSector:sector,observed:profile.sector||'unknown',sectorMatch:profile.sector===sector,
  expectedSubtype:key||null,observedSubtype:profile.key||profile.subtype||null,
  subtypeMatch:key?profile.key===key:null,labelStatus:'proposed_not_independently_verified'};
}
export function failureCategory(status,code='') {
 if(/WEBSITE_LIMIT|SCAN_LIMIT|QUOTA|RATE_LIMIT/.test(code)||[402,429].includes(status))return 'quota';
 if(/DATABASE|INFRASTRUCTURE/.test(code))return 'infrastructure';
 if(/BLOCKED|CHALLENGE|CAPTCHA|ROBOTS/.test(code))return 'site_blocked';
 if([401,403].includes(status))return 'auth';
 if(/TIMEOUT/.test(code))return 'timeout';
 if(status===0||/FETCH_DNS|FETCH_NETWORK/.test(code))return 'network';
 if(status===200)return 'invalid_response';
 return status>=500?'server_error':'site_or_input_error';
}
