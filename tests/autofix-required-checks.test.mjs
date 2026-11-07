import test from 'node:test';import assert from 'node:assert/strict';
import {mergeVerifiedPullRequest} from '../lib/autofix-merge-gate.ts';
const H='a'.repeat(40),B='b'.repeat(40),APP=15368;
const expected={repo:'owner/repo',prNumber:7,baseBranch:'main',branch:'rankfix/qa',path:'index.html',approvedBlobSha:B,title:'Approved fix'};
function fake(options={}){const calls=[];let reads=0;const gh=async(path,init={})=>{
 calls.push({path,init});const url=new URL('https://api.example'+path);
 if(url.pathname.endsWith('/merge'))return {merged:true};
 if(url.pathname.endsWith('/pulls/7')){reads++;return {state:'open',draft:false,merged:false,mergeable:true,mergeable_state:'clean',head:{ref:expected.branch,sha:options.changeHead&&reads>1?'c'.repeat(40):H},base:{ref:'main',sha:'base'},...options.pull};}
 if(url.pathname.includes('/rules/branches/')){if(options.unreadable)throw Object.assign(Error('denied'),{status:403});return options.noRequired?[]:[{type:'required_status_checks',ruleset_id:9,parameters:{required_status_checks:[{context:'build',integration_id:APP}]}}];}
 if(url.pathname.endsWith('/rulesets/9'))return {enforcement:'active',current_user_can_bypass:options.bypass?'always':'never'};
 if(url.pathname.endsWith('/protection'))throw Object.assign(Error('none'),{status:404});
 if(url.pathname.endsWith('/check-runs'))return {total_count:options.incomplete?2:options.missing?0:1,check_runs:options.missing?[]:[{id:1,name:'build',head_sha:options.stale?'d'.repeat(40):H,status:options.pending?'in_progress':'completed',conclusion:options.conclusion||'success',app:{id:options.wrongApp?2:APP},check_suite:{id:4}}]};
 if(url.pathname.endsWith('/status'))return {sha:H,total_count:0,statuses:[]};
 if(url.pathname.includes('/contents/'))return {sha:options.changedBlob?'changed':B};
 if(url.pathname.endsWith('/files'))return [{filename:'index.html',status:'modified'}];
 throw Error('Unexpected API '+path);
 };return {gh,calls};}
for(const [name,option] of Object.entries({missing:{missing:true},failed:{conclusion:'failure'},skipped:{conclusion:'skipped'},neutral:{conclusion:'neutral'},pending:{pending:true},stale:{stale:true},unreadable:{unreadable:true},undefinedRequirements:{noRequired:true},incomplete:{incomplete:true},wrongApp:{wrongApp:true},bypass:{bypass:true},headChanged:{changeHead:true},contentChanged:{changedBlob:true}}))test('AutoFix blocks '+name,async()=>{const f=fake(option);const r=await mergeVerifiedPullRequest(f.gh,expected);assert.equal(r.merged,false);assert.equal(f.calls.filter(x=>x.path.endsWith('/merge')).length,0);});
test('AutoFix merges only enforced successful required checks on two stable reads with SHA precondition',async()=>{const f=fake();const r=await mergeVerifiedPullRequest(f.gh,expected);assert.equal(r.merged,true);const call=f.calls.find(x=>x.path.endsWith('/merge'));assert.equal(JSON.parse(call.init.body).sha,H);assert.equal(f.calls.filter(x=>x.path.endsWith('/pulls/7')).length,2);});
