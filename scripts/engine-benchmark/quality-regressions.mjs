#!/usr/bin/env node
// Offline, fixed-input gate. Must be launched with the existing offline loader.
// This measures regressions, not independent real-world 9/10 quality.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {runSectorPeers} from '../../tests/scan-matrix/run-sector-peers.mjs';
import {compareSectorRuns} from '../../lib/report-quality-gate.mjs';
const args=process.argv.slice(2),i=args.indexOf('--out'),out=resolve(i>=0?args[i+1]:'qa-results/engine-quality-regressions.json');
const before=JSON.parse(await readFile(new URL('../../tests/fixtures/sector-quality-results/heldout-first-baseline.json',import.meta.url),'utf8'));
const reference=await runSectorPeers({quiet:true});
const development=await runSectorPeers({fixtureDir:'tests/fixtures/sector-quality',group:'development',quiet:true});
const validation=await runSectorPeers({fixtureDir:'tests/fixtures/sector-quality',group:'heldout',quiet:true});
const comparison=compareSectorRuns(before,validation);
const inputHashes={};
for(const path of ['lib/primary-business-identity.ts','lib/eu-identity.ts','tests/fixtures/sector-quality/development.json','tests/fixtures/sector-quality/heldout.json'])inputHashes[path]=createHash('sha256').update(await readFile(path)).digest('hex');
const result={kind:'offline_synthetic_regression',independentQualityScore:null,baselineCommit:'1d7d753deabf4e31d49fb420b56243881fecc54c',candidateCommit:process.env.RF_QA_COMMIT_SHA||null,inputHashes,reference,development,validation,comparison,
 noRegressionGatePassed:reference.failed===0&&development.failed===0&&comparison.accepted,
 strictValidationAllCorrect:validation.failed===0,
 limitations:['Same-author synthetic validation is not independent real-website evidence.','Strict unresolved cases are retained and never marked as passed.','No live browser, database, dashboard or complete-website validation is implied.']};
await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({noRegressionGatePassed:result.noRegressionGatePassed,referenceCases:reference.total,developmentCases:development.total,strictValidationCorrect:validation.rows.filter(r=>r.result.passed).length,strictValidationTotal:validation.total,unresolved:comparison.unresolved,independentQualityScore:null,out}));
process.exitCode=result.noRegressionGatePassed?0:1;
