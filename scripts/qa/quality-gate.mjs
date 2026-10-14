// A release gate for the isolated RankFix QA pilot. This module performs no I/O.
// A successful HTTP response is NOT proof that a scan or its report is correct.
const BAD_HEADING = /componentVariation|headline_underscored|null\s*!=|p\(e,|{{\s*[#/]*(?:if|each)\b|<script\b/i;
const NEWS_HOSTS = new Set(['nos.nl','www.bbc.com','www.cnn.com','www.spiegel.de','www.lemonde.fr']);

const finiteScore = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
const statusOf = check => String(check?.status ?? check?.issue_status ?? '').toLowerCase();
const textOf = check => String(check?.message ?? check?.details ?? '');
const listOf = value => Array.isArray(value) ? value : [];

export function assessPilotResult({site, httpStatus, body, error}) {
  const blockers = [], notices = [];
  const add = (code, details) => blockers.push({code,details});
  const scanned = httpStatus === 200 && body?.success === true;
  if (!scanned) {
    return {
      state:'unavailable', scanned:false, blockers:[],
      notices:[{code:'SITE_UNAVAILABLE',details:'Scan niet voltooid: HTTP '+httpStatus+
        (error ? ', '+String(error) : '')+'. Geen SEO-fout en geen goedkeuring.'}]
    };
  }

  const actualSector = body.classification?.sector?.key ?? body.sectorProfile?.key ?? null;
  if (actualSector !== site.expectedSector) {
    add('SECTOR_MISMATCH','Verwacht '+site.expectedSector+', ontvangen '+(actualSector ?? 'unknown')+
      '. Een brede sector mag een specifieke subsector niet zonder bewijs vervangen.');
  }
  const expectedNews = site.expectedSector === 'news_media' || NEWS_HOSTS.has(new URL(site.url).hostname);
  const modules = listOf(body.sectorProfile?.applicableModules);
  if (expectedNews && !modules.includes('news_media')) add('NEWS_MODULE_MISSING','news_media ontbreekt in de modules.');
  if (expectedNews && modules.includes('booking')) {
    add('NEWS_BOOKING_REVIEW','Booking staat op een nieuwssite aan; aantoonbare boekingsfunctie vereist.');
  }
  const coverage = body.coverage?.coveragePercent;
  if (typeof coverage !== 'number' || !Number.isFinite(coverage)) {
    add('COVERAGE_UNKNOWN','De scan rapporteert geen betrouwbare dekking.');
  } else if (coverage < (expectedNews ? 85 : 75)) {
    add('LOW_COVERAGE','Dekking '+coverage+'% is lager dan de QA-grens '+(expectedNews ? 85 : 75)+'%.');
  }
  if (body.scoreModel?.provisional === true) {
    add('PROVISIONAL_SCORE','De score is voorlopig; geen release-goedkeuring.');
  }

  const score = body.overallScore;
  if (!finiteScore(score) || !finiteScore(body.seo?.score) || !finiteScore(body.geo?.score)) {
    add('INVALID_SCORE','Totaal-, SEO- en GEO-score moeten getallen tussen 0 en 100 zijn.');
  }
  const model = body.scoreModel;
  if (!model || typeof model.formula !== 'string' || !model.headline) {
    add('SCORE_EXPLANATION_MISSING','Scoreformule en paginasteekproef-weging ontbreken.');
  } else {
    if (model.headline.score !== score) add('SCORE_REPORT_MISMATCH','Headline-score en totaalscore verschillen.');
    if (!finiteScore(model.headline.pageScore)) add('SCORE_PAGE_MISSING','Onderliggende paginascore ontbreekt.');
    if (model.headline.sampleWeight > 0 && !finiteScore(model.headline.sampleScore)) {
      add('SCORE_SAMPLE_MISSING','Er is een steekproefweging zonder geldige steekproefscore.');
    }
    const weights = model.weights || {};
    if (weights.seo !== 0.6 || weights.geo !== 0.4) add('SCORE_WEIGHTS_UNEXPECTED','De gecombineerde SEO/GEO-gewichten zijn niet 60/40.');
    if (finiteScore(model.headline.pageScore) && finiteScore(body.seo?.score) && finiteScore(body.geo?.score)) {
      const base = Math.round(body.seo.score * 0.6 + body.geo.score * 0.4);
      if (model.headline.pageScore < base - 1 && !model.headline.pageCapReason) {
        add('PAGE_SCORE_CAP_UNEXPLAINED','Paginascore '+model.headline.pageScore+
          ' ligt onder de berekende '+base+' zonder zichtbare reden voor de verlaging.');
      }
    }
    if (model.headline.sampleWeight > 0 && model.headline.sampledPages < 1) {
      add('SCORE_SAMPLE_COUNT','Steekproefweging zonder gecontroleerde extra pagina.');
    }
  }

  const checks = [...listOf(body.seo?.checks),...listOf(body.geo?.checks),...listOf(body.checks)];
  const check = key => checks.find(item => item?.key === key || item?.rule_id === key);
  const h1 = check('h1'), headings = check('headings');
  const metrics = body.metrics || {};
  const rawHeadings = [...listOf(metrics.h1s),...(metrics.h1 ? [metrics.h1] : [])].join(' ');
  if (BAD_HEADING.test(rawHeadings)) {
    add('TEMPLATE_LEAK_IN_METRICS','HTML/JS-templatecode staat nog als H1 in paginametrics.');
    if (statusOf(h1) === 'pass') add('TEMPLATE_H1_FALSE_PASS','H1 met broncode is ten onrechte goedgekeurd.');
  }
  if (statusOf(h1) === 'pass' && textOf(headings).includes('geen H1 gevonden')) {
    add('HEADING_CONTRADICTION','H1-controle slaagt terwijl heading-structuur meldt dat er geen H1 is.');
  }
  if (statusOf(h1) === 'pass' && metrics.h1Count === 0) {
    add('H1_METRICS_CONTRADICTION','H1-controle slaagt maar metrics tellen nul H1-elementen.');
  }
  if (!h1 || !headings) add('HEADING_CHECK_MISSING','H1- of heading-structuurcontrole ontbreekt.');

  if (expectedNews && body.classification?.sector?.key === 'news_media' && body.sectorProfile?.label &&
      !/nieuws|media|news/i.test(body.sectorProfile.label)) {
    add('SECTOR_LABEL_CONTRADICTION','Sector-id is nieuws maar het sectorlabel niet.');
  }
  if (Array.isArray(body.metrics?.h1s) && body.metrics.h1Count < body.metrics.h1s.length) {
    add('H1_COUNT_CONTRADICTION','Metrics tellen minder H1-elementen dan zij opsommen.');
  }

  if (model?.headline?.sampleWeight > 0) notices.push({
    code:'SAMPLED_HEADLINE',details:'De totaalscore omvat een beperkte pagina-steekproef, geen volledige sitecrawl.'
  });
  return {state:blockers.length ? 'review' : 'pass',scanned:true,blockers,notices};
}
