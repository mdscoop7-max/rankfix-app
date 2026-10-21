import { htmlAttribute } from "./html-head-evidence.ts";

/**
 * Official profiles explicitly linked from the site's own footer or a labelled
 * social navigation group. Mentions of a client/social network in the page body
 * are not proof of an official profile.
 */
const SOCIAL_HOSTS = /(?:^|\.)(?:linkedin\.com|youtube\.com|instagram\.com|facebook\.com|x\.com|twitter\.com|tiktok\.com)$/i;
const SOCIAL_NAV = /<nav\b[^>]*(?:social|soziale|réseaux\s+sociaux|redes\s+sociales)[^>]*>[\s\S]*?<\/nav>/gi;
const FOOTER = /<footer\b[^>]*>[\s\S]*?<\/footer>/gi;
// Many corporate sites render icon links in a labelled social-media section,
// outside the footer. Only explicitly labelled containers qualify.
const SOCIAL_SECTION = /<section\b[^>]*(?:social-media|social-links|social-icons|follow-us|soziale-medien|socialmedia)[^>]*>[\s\S]{0,30000}?<\/section>/gi;
const IGNORED_PATHS = /^\/(?:share|sharer|sharer\.php|intent|dialog|watch|embed|search|hashtag)(?:\/|$)/i;

export function officialSocialProfileLinks(html:string):string[] {
  const regions=[...html.matchAll(FOOTER),...html.matchAll(SOCIAL_NAV),...html.matchAll(SOCIAL_SECTION)].map(match=>match[0]);
  const links=new Set<string>();
  for(const region of regions) {
    for(const match of region.matchAll(/<a\b[^>]*>/gi)) {
      const raw=htmlAttribute(match[0],"href");
      if(!raw || !/^https:\/\//i.test(raw))continue;
      try {
        const uri=new URL(raw);
        if(!SOCIAL_HOSTS.test(uri.hostname) || IGNORED_PATHS.test(uri.pathname))continue;
        const parts=uri.pathname.split("/").filter(Boolean);
        if(parts.length===0)continue;
        // Reject generic root/social homepage links and sharing widgets.
        if(uri.hostname.endsWith("youtube.com") && !/^(?:@|channel$|user$|c$)/i.test(parts[0]))continue;
        if(uri.hostname.endsWith("linkedin.com") && !/^(?:company|school|in|showcase)$/i.test(parts[0]))continue;
        if(uri.hostname.endsWith("facebook.com") && /^(?:login|plugins|help|privacy)$/i.test(parts[0]))continue;
        uri.hash="";
        for(const param of [...uri.searchParams.keys()])uri.searchParams.delete(param);
        links.add(uri.toString());
      }catch{}
    }
  }
  return [...links].slice(0,12);
}
