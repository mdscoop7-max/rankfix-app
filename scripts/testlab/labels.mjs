// TestLab labels describe subtypes; the engine returns broader primary sectors.
// Keep both comparisons visible. A broad match never proves a subtype.
const labels={
 // MKB-48 vocabulary: branch proof is checked separately below.
 garage:['automotive','car_repair'],realtor:['real_estate','real_estate'],
 law:['professional_services','legal'],training:['education','course_training'],
 gym:['fitness_sports','fitness'],plumber:['home_services','plumber'],
 gardener:['home_services','gardener'],hotel:['hospitality','hotel'],
 beauty:['beauty'],

 payments:['financial_services','financial_payments'],banking:['financial_services','financial_banking'],insurance:['financial_services','financial_insurance'],financial_services:['financial_services'],
 healthcare:['health_wellness'],veterinary_animal_care:['health_wellness','veterinary'],
 energy:['energy_utilities'],telecom:['telecom_technology'],logistics:['transport_travel'],travel:['transport_travel','passenger_transport'],retail:['ecommerce'],ecommerce:['ecommerce'],software:['saas_b2b'],
 legal_services:['professional_services','legal'],architecture_design:['professional_services','architecture_design'],
 charities_nonprofits:['nonprofit','charities_nonprofits'],museums_culture:['events_culture','museum_culture'],
 manufacturing:['manufacturing_industrial','brand_manufacturer'],industry:['manufacturing_industrial'],
 recruitment_staffing:['recruitment'],
 // fresh144 catalog vocabulary (29 Oct): broad labels without a subtype. Without
 // these, "public" vs government or "transport" vs transport_travel counted as a
 // sector error (25 of 40 "mismatches" in the 1dc8681 export).
 public:['government'],transport:['transport_travel'],culture:['events_culture'],finance:['financial_services'],
 nonprofit:['nonprofit'],construction:['manufacturing_industrial','construction_infrastructure'],
 engineering:['professional_services'],research:['education'],
 // sector80 catalog vocabulary (6 Nov, 993161a8 export): 33 of 33 "mismatches"
 // included literal-label differences ("fashion_retail" vs engine "ecommerce").
 // Each label maps to its main sector plus the branch subtype it requires, so a
 // generic main-sector answer is "partial" (never counted as a correct branch).
 accounting:['professional_services','accounting'],accounting_software:['saas_b2b','accounting_software'],
 airline:['transport_travel','airline'],rail_transport:['transport_travel','rail_transport'],travel_agency:['transport_travel','travel_agency'],
 parcel_delivery:['transport_travel','postal_logistics'],shipping:['transport_travel','shipping'],port_operator:['maritime_ports'],
 architecture:['professional_services','architecture_design'],notary:['professional_services','notary'],
 asset_management:['financial_services','financial_asset_management'],pension_administration:['financial_services','financial_pension'],
 mortgage_advice:['financial_services','financial_mortgage'],payment_services:['financial_services','financial_payments'],payment_infrastructure:['financial_services','financial_payments'],
 beauty_salon:['beauty','beauty_salon'],hair_salon:['beauty','hair_salon'],
 beauty_retail:['ecommerce','beauty_retail'],bicycle_retail:['ecommerce','bicycle_retail'],bookstore:['ecommerce','bookstore'],electronics_retail:['ecommerce','electronics_retail'],
 fashion_retail:['ecommerce','fashion_retail'],furniture_retail:['ecommerce','furniture_retail'],garden_center:['ecommerce','garden_center'],hardware_retail:['ecommerce','hardware_retail'],
 sporting_goods:['ecommerce','sporting_goods'],supermarket:['ecommerce','supermarket'],toy_retail:['ecommerce','toy_retail'],
 car_dealership:['automotive','car_dealership'],car_rental:['automotive','car_rental'],car_repair:['automotive','car_repair'],
 beverage_manufacturing:['manufacturing_industrial','beverage_manufacturing'],chemical_manufacturing:['manufacturing_industrial','chemical_manufacturing'],
 machinery_manufacturing:['manufacturing_industrial','machinery_manufacturing'],pharmaceutical_manufacturing:['manufacturing_industrial','pharmaceutical_manufacturing'],
 childcare:['education','childcare'],primary_education:['education','primary_education'],university:['education','university'],driving_school:['education','driving_school'],
 cinema:['events_culture','cinema'],theatre:['events_culture','theatre'],event_venue:['events_culture','event_venue'],museum:['events_culture','museum_culture'],
 cleaning_services:['home_services','cleaning'],electrical_installation:['home_services','electrician'],hvac:['home_services','hvac'],
 painting_services:['home_services','painter'],roofing:['home_services','roofer'],landscaping:['home_services','gardener'],
 dentist:['health_wellness','dentist'],general_practice:['health_wellness','general_practice'],hearing_care:['health_wellness','hearing_care'],
 home_care:['health_wellness','home_care'],hospital:['health_wellness','hospital'],mental_health:['health_wellness','mental_health'],
 optician:['health_wellness','optician'],pharmacy:['health_wellness','pharmacy'],physiotherapy:['health_wellness','physiotherapy'],veterinary:['health_wellness','veterinary'],
 energy_supplier:['energy_utilities','energy_supplier'],ev_charging:['energy_utilities','ev_charging'],grid_operator:['energy_utilities','grid_operator'],water_utility:['energy_utilities','water_utility'],
 holiday_park:['hospitality','holiday_park'],restaurant:['hospitality','restaurant'],
 internet_provider:['telecom_technology'],telecommunications:['telecom_technology'],staffing:['recruitment'],
 property_management:['real_estate','property_management'],waste_management:['waste_recycling'],
};
// A retail label is also met by a LOCAL retail trade: an optician or pharmacy
// sells goods over the counter (and often online) as part of its own trade, a
// bakery is local food retail. These are reported in their own family; the
// TestLab broad label "retail" must not count them as wrong.
// 31 Oct: only true family relations stay here. engineering→industrial and
// construction→home_services were removed: they let a wrong branch pass.
// A port authority IS logistics infrastructure, so that relation stays.
const alsoCompatible={retail:[['health_wellness','optician'],['health_wellness','pharmacy'],['food_local_retail',null]],
 logistics:[['maritime_ports',null]]};
// A confirmed webshop proves the sales CHANNEL, never the branch. A retail or
// ecommerce label on a webshop is only equivalent when the observed sector is a
// goods-retail family (the niche of what is sold). A craft trade (bakery), a
// salon or any service/non-retail sector on a webshop is a mismatch to review:
// Leen Bakker (furniture webshop) typed as bakery must never pass.
const CRAFT_OR_SERVICE_KEYS=new Set(['bakery','beauty_salon','hair_salon','restaurant','car_repair','car_rental']);
export function isGoodsRetailSector(profile={}) {
 const {sector,key}=profile;
 if(CRAFT_OR_SERVICE_KEYS.has(key))return false;
 if(sector==='ecommerce'||sector==='food_local_retail'||sector==='beauty')return true;
 return sector==='health_wellness'&&(key==='optician'||key==='pharmacy');
}
export function compareSector(expected,profile={}) {
 const [sector,key]=labels[expected]||[expected];
 const compatible=profile.sector===sector||(alsoCompatible[expected]||[]).some(([s,k])=>profile.sector===s&&(!k||profile.key===k));
 return {expected,expectedSector:sector,observed:profile.sector||'unknown',sectorMatch:compatible,
  expectedSubtype:key||null,observedSubtype:profile.key||profile.subtype||null,
  subtypeMatch:key?profile.key===key:null,labelStatus:'proposed_not_independently_verified'};
}
// 3 Nov 2026: a matching MAIN sector does not prove the BRANCH. Labels whose main
// sector holds several unrelated branches (an engineering firm and a law firm are
// both professional_services) need an engine subtype that shows the branch.
// keys: subtypes that prove the branch; exclude: subtypes that disprove it.
// Without such a rule, a label carrying a subtype (payments → financial_payments)
// requires exactly that subtype.
const BRANCH={
 garage:{keys:['car_repair']}, law:{keys:['legal']}, realtor:{keys:['real_estate']},
 training:{keys:['course_training']}, gym:{keys:['fitness']}, hotel:{keys:['hotel']},
 plumber:{keys:['plumber'],byEvidence:{home_services:'plumber'}},
 gardener:{keys:['gardener'],byEvidence:{home_services:'gardener'}},
 beauty:{keys:['beauty','beauty_salon','hair_salon']},

 // 3 Nov (owner): an engineering firm typed as "architecture & design" is decided
 // by the engine's own sector evidence, never automatically approved or rejected.
 engineering:{keys:['engineering','engineering_consultancy'],byEvidence:{architecture_design:'engineering'}},
 research:{keys:['research','research_institute']},
 construction:{keys:['construction_infrastructure']},
 manufacturing:{exclude:['construction_infrastructure']},
 industry:{exclude:['construction_infrastructure']},
 // A passenger carrier is transport, but not logistics (goods); ports and postal stay.
 logistics:{exclude:['passenger_transport']},
 // sector80: a parent subtype shows the main family but not the branch (generic).
 airline:{keys:['airline'],parents:['passenger_transport']},rail_transport:{keys:['rail_transport'],parents:['passenger_transport']},
 hospital:{keys:['hospital','healthcare_academic']},landscaping:{keys:['gardener'],byEvidence:{home_services:'gardener'}},
 cleaning_services:{keys:['cleaning'],parents:['home_services']},
};
/**
 * Does the observed profile show the expected BRANCH, beyond the main sector?
 * match: an allowed subtype (or the label has no branch requirement);
 * generic: only the main sector is known (key missing or equal to the sector);
 * different: another specific subtype of the same main sector.
 */
// Multilingual evidence vocabulary for evidence-dependent neighbour branches.
const BRANCH_EVIDENCE={
 plumber:{confirm:/\b(?:loodgieter\w*|plumb(?:er|ing)|installatiebedrijf|sanitair|ontstopp\w*)\b/iu,reject:/\b(?:hovenier\w*|gardener|landscap\w*)\b/iu},
 gardener:{confirm:/\b(?:hovenier\w*|tuinaanleg|tuinonderhoud|gardener|landscap\w*)\b/iu,reject:/\b(?:loodgieter\w*|plumb(?:er|ing)|installatiebedrijf)\b/iu},

 engineering:{
  confirm:/(?<![\p{L}])(?:ingenieur\w*|engineer\w*|ingénierie|ingeniería|ingegneria|civiele techniek|civil engineering|bauingenieur\w*|tiefbau|waterbouw|water management|watermanagement|infrastructu\w*|infrastruktur\w*|technisch advies\w*|technical consult\w*|projectmanagement|project management)(?![\p{L}])/iu,
  reject:/(?<![\p{L}])(?:architect\w*|architekt\w*|architecte\w*|arquitect\w*|architett\w*|interieur\w*|interior design\w*|binnenhuisarchitect\w*|landschapsarchitect\w*)(?![\p{L}])/iu,
 },
};
function evidenceText(profile){
 const ev=profile.evidence;
 // Only the engine's evidence lines: the subtype label merely restates the key.
 return (Array.isArray(ev)?ev:ev?[ev]:[]).filter(Boolean).map(String).join(' · ');
}
export function branchComparison(expected,profile={}) {
 const [,labelKey]=labels[expected]||[expected];
 const rule=BRANCH[expected]||(labelKey?{keys:[labelKey]}:{});
 const key=profile.key||profile.subtype||null;
 const viaEvidence=rule.byEvidence&&key?rule.byEvidence[key]:null;
 if(viaEvidence){
  const vocab=BRANCH_EVIDENCE[viaEvidence];const text=evidenceText(profile);
  const confirms=vocab.confirm.test(text),rejects=vocab.reject.test(text);
  // Engineering named in the engine's evidence: the expected branch is shown.
  // Only architecture/interior wording: another branch. Neither or both: not proven.
  if(confirms&&!rejects)return 'match';
  if(rejects&&!confirms)return 'different';
  return 'generic';
 }
 const generic=!key||key===profile.sector||key==='unknown'||Boolean(rule.parents&&rule.parents.includes(key));
 if(rule.exclude&&key&&rule.exclude.includes(key))return 'different';
 if(!rule.keys)return 'match';
 if(key&&rule.keys.includes(key))return 'match';
 return generic?'generic':'different';
}
/**
 * QA #204: one verdict per scanned site so a literal label difference is never
 * counted as a sector bug. exact: same label; equivalent: parent/child or niche
 * label of the same family (banking → financial_services, retail → optician),
 * or a retail label on a confirmed webshop whose sector is a goods-retail
 * family; unconfirmed: no primary sector; mismatch: probably a real error, to
 * be reviewed by hand (also when the webshop is confirmed but the branch is not).
 * 3 Nov: equivalent also requires the branch (branchComparison). Main sector
 * right but branch unknown is "partial" and never counts as a correct branch;
 * main sector right with another specific branch is a mismatch.
 */
export function sectorVerdict(expected,profile={}) {
 const c=compareSector(expected,profile);
 if(!profile.sector||profile.sector==='unknown')return {...c,verdict:'unconfirmed',reason:'Geen hoofdsector vastgesteld'};
 // A platform's subject matter is not its own service trade.
 if(['beauty','plumber','gardener','garage','hotel','dentist','restaurant','realtor','law','gym','training'].includes(expected)
   && ['marketplace','service_marketplace','booking_platform','comparison_platform'].includes(profile.websiteType))
  return {...c,verdict:'mismatch',reason:'Platform voor aanbod van derden bewijst geen eigen dienstverlening'};
 // A known parent family without the required branch is partial, not wrong.
 if(['beauty','beauty_salon','hair_salon'].includes(expected)&&profile.sector==='health_wellness'&&(!profile.key||profile.key==='health_wellness'))
  return {...c,branch:'generic',verdict:'partial',reason:'Brede zorg-/welzijnssector bewijst geen beautybedrijf'};
 if(profile.sector===expected||profile.key===expected)return {...c,verdict:'exact',reason:''};
 if(c.sectorMatch){
  const branch=branchComparison(expected,profile);
  if(branch==='generic')return {...c,branch,verdict:'partial',reason:'Hoofdsector juist, branche niet bevestigd (geen subtype of bewijs dat de branche aantoont)'};
  if(branch==='different')return {...c,branch,verdict:'mismatch',reason:'Hoofdsector juist, maar de branche wijkt af: handmatig beoordelen'};
  return {...c,branch,verdict:'equivalent',reason:'Taxonomisch equivalent (ouder/kind- of nichelabel van dezelfde familie, branche bevestigd)'};
 }
 const retailLabel=expected==='retail'||expected==='ecommerce';
 if(retailLabel&&profile.websiteType==='ecommerce_store'){
  if(isGoodsRetailSector(profile))return {...c,verdict:'equivalent',reason:'Bevestigde webshop; sector toont de niche van het assortiment'};
  return {...c,verdict:'mismatch',reason:'Webshop bevestigd, branche wijkt af: handmatig beoordelen'};
 }
 return {...c,verdict:'mismatch',reason:'Waarschijnlijk echte sectorfout: handmatig beoordelen'};
}
export function failureCategory(status,code='',attribution=null) {
 // Incident attribution from the scan API is authoritative when present.
 if(attribution==='rankfix_session')return 'auth';
 if(attribution==='rankfix_quota')return 'quota';
 if(attribution==='rankfix_infrastructure')return 'infrastructure';
 if(/AUTH_LOOKUP_UNAVAILABLE/.test(code))return 'infrastructure';
 if(/SESSION_EXPIRED/.test(code))return 'auth';
 // The target website's own refusals (its 429, its login, its WAF) are site
 // blocks, never a RankFix quota: they must not stop the TestLab run.
 if(/SITE_RATE_LIMITED|HTTP_AUTH_REQUIRED/.test(code))return 'site_blocked';
 if(/WEBSITE_LIMIT|SCAN_LIMIT|QUOTA|RATE_LIMIT/.test(code)||[402,429].includes(status))return 'quota';
 if(/DATABASE|INFRASTRUCTURE/.test(code))return 'infrastructure';
 if(/BLOCKED|CHALLENGE|CAPTCHA|ROBOTS|UNVERIFIED_NOT_FOUND/.test(code))return 'site_blocked';
 // The website served an error or maintenance page instead of its content.
 if(/SITE_ERROR_PAGE|HTTP_NOT_FOUND|HTTP_PAYMENT_REQUIRED|SITE_TLS_INVALID|SITE_DOMAIN_NOT_FOUND|HTTP_SERVER_ERROR/.test(code))return 'site_unavailable';
 if([401,403].includes(status))return 'auth';
 if(/TIMEOUT/.test(code))return 'timeout';
 if(status===0||/FETCH_|REDIRECT_LOOP|REDIRECT_LIMIT/.test(code))return 'network';
 if(status===200)return 'invalid_response';
 return status>=500?'server_error':'site_or_input_error';
}
