/** Compare the same frozen input; never substitute missing cases with passes. */
export function compareSectorRuns(baseline,candidate){
 const issues=[];
 if(!baseline?.fixtureSha256||baseline.fixtureSha256!==candidate?.fixtureSha256)issues.push('fixture_mismatch');
 const before=new Map((baseline?.rows||[]).map(r=>[r.host,r])),after=new Map((candidate?.rows||[]).map(r=>[r.host,r]));
 const fixed=[],regressions=[],missing=[],unresolved=[];
 for(const [host,b] of before){const c=after.get(host);
  if(!c){missing.push(host);continue;}
  if(b.result?.passed===true&&c.result?.passed!==true)regressions.push(host);
  if(b.result?.passed===false&&c.result?.passed===true)fixed.push(host);
  if(c.result?.passed!==true)unresolved.push(host);
 }
 return {comparable:issues.length===0,issues,fixed,regressions,missing,unresolved,accepted:issues.length===0&&!regressions.length&&!missing.length};
}
