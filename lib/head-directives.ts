import {decodeHtmlEntities} from './html-entities.ts';
const attr=(tag:string,name:string)=>{
 const m=tag.match(new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"\\r\\n]*)"|\'([^\'\\r\\n]*)\'|([^\\s"\'=<>]+))','i'));
 return decodeHtmlEntities(m?.[1]??m?.[2]??m?.[3]??'').trim();
};
/** Collect every applicable declaration; the first tag must not hide a later veto. */
export function readHeadDirectives(html:string,pageUrl:string,xRobots=''){
 const robots=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]).filter(t=>/^(?:robots|googlebot|googlebot-news|bingbot)$/i.test(attr(t,'name'))).map(t=>`${attr(t,'name')}: ${attr(t,'content')}`);
 const canonicals=[...html.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]).filter(t=>attr(t,'rel').toLowerCase().split(/\s+/).includes('canonical')).map(t=>attr(t,'href'));
 const targets=canonicals.map(h=>{try{if(!h)return 'invalid';const u=new URL(h,pageUrl);u.hash='';return u.toString();}catch{return 'invalid:'+h;}});
 return {robots,canonicals,conflictingCanonicals:new Set(targets).size>1,noindex:/(?:^|[,;:\s])(?:noindex|none)(?=$|[,;\s])/i.test([...robots,xRobots].join(' | '))};
}
