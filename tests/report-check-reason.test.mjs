import test from 'node:test';
import assert from 'node:assert/strict';
import {reportCheckReason} from '../lib/report-check-reason.ts';

test('Consent Mode retains its recorded runtime limitation without inventing a raw-only scan', () => {
  const message = 'Google tracking is gevonden, maar de beschikbare pagina bewijst niet of Consent Mode runtime via GTM of een CMP wordt ingesteld.';
  const reason = reportCheckReason({status:'unable_to_confirm',message},'nl');
  assert.equal(reason,message);
  assert.doesNotMatch(reason,/deze scan gebruikte raw HTML/);
});

test('explicit reasons survive grouping, including different failures with the same reason code', () => {
  for(const message of [
    'De browserversie is gerenderd, maar consentinteracties zijn niet uitgevoerd.',
    'De controle gebruikte bewust alleen raw HTML; browsergedrag is niet onderzocht.',
    'De productpagina weigerde toegang met HTTP 429.',
    'De geselecteerde contactpagina bevat geen betrouwbaar formulierbewijs.',
  ]) {
    assert.equal(reportCheckReason({status:'unable_to_confirm',reasonCode:'needs_js',message},'nl'),message);
    assert.equal(reportCheckReason({status:'unable_to_confirm',message},'en'),message);
  }
});

test('missing legacy messages get neutral fallbacks without inferring unperformed rendering', () => {
  const reason=reportCheckReason({status:'unable_to_confirm',reasonCode:'needs_js'},'nl');
  assert.match(reason,/niet.*bevestig/i);
  assert.doesNotMatch(reason,/deze scan gebruikte raw HTML|JavaScript-rendering zichtbaar/);
  assert.match(reportCheckReason({status:'not_applicable'},'nl'),/niet.*toepassing/i);
});
