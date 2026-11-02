// Scan-only, deliberately host-bound jar. Never widen cookies across hosts using
// a guessed registrable domain. Domain cookies for parent/sibling hosts are
// withheld until a complete public-suffix implementation can prove that scope.
type Cookie={name:string;value:string;host:string;path:string;secure:boolean;expires:number};
export class RedirectCookieJar {
 private cookies:Cookie[]=[];
 private now:()=>number;
 constructor(now:()=>number=Date.now){this.now=now;}
 store(url:URL,headers:string[]){
  for(const raw of headers.slice(0,20)){
   const [pair,...attrs]=raw.split(';');const eq=pair.indexOf('=');
   if(eq<1||pair.length>4096)continue;
   const name=pair.slice(0,eq).trim(),value=pair.slice(eq+1).trim();
   if(!/^[!#$%&'*+.^_`|~\w-]+$/.test(name)||/[\r\n;]/.test(value))continue;
   const a=new Map(attrs.map(x=>{const i=x.indexOf('=');return [x.slice(0,i<0?undefined:i).trim().toLowerCase(),i<0?'':x.slice(i+1).trim()];}));
   const host=url.hostname.toLowerCase();const domain=a.get('domain')?.replace(/^\./,'').toLowerCase();
   if(domain&&domain!==host)continue;
   const secure=a.has('secure');if(secure&&url.protocol!=='https:')continue;
   const defaultPath=url.pathname.slice(0,url.pathname.lastIndexOf('/'))||'/';
   const path=a.get('path')?.startsWith('/')?a.get('path')!:defaultPath;
   const maxAge=a.get('max-age');let expires=Infinity;
   if(maxAge&&/^-?\d+$/.test(maxAge))expires=this.now()+Number(maxAge)*1000;
   else if(a.has('expires')){const t=Date.parse(a.get('expires')!);if(Number.isFinite(t))expires=t;}
   this.cookies=this.cookies.filter(c=>!(c.name===name&&c.host===host&&c.path===path));
   if(expires>this.now())this.cookies.push({name,value,host,path,secure,expires});
  }
  this.cookies=this.cookies.slice(-50);
 }
 header(url:URL){
  this.cookies=this.cookies.filter(c=>c.expires>this.now());
  const matching=this.cookies.filter(c=>c.host===url.hostname.toLowerCase()&&(!c.secure||url.protocol==='https:')&&(url.pathname===c.path||url.pathname.startsWith(c.path.endsWith('/')?c.path:c.path+'/'))).sort((a,b)=>b.path.length-a.path.length);
  return matching.length?matching.map(c=>`${c.name}=${c.value}`).join('; '):null;
 }
}
