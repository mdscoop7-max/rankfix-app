    const accessibilityAnchorTags=[...html.matchAll(/<a\b[^>]*>/gi)];
    const unnamedLinks=accessibilityAnchorTags.filter((match)=>{
      const tag=match[0]||"";
      const href=attrFromTag(tag,"href");
      if(!href || href==="#" || /^javascript:/i.test(href)) return false;
      return !attrFromTag(tag,"aria-label")&&!attrFromTag(tag,"aria-labelledby")&&!attrFromTag(tag,"title");
    }).length;
    const headingLevelSkips=headings.reduce((count,heading,index)=>{
      if(index===0) return count;
      const previous=headings[index-1];
      return count+(heading.level>previous.level+1?1:0);
    },0);
    const hasMainLandmark=/<main\b/i.test(html)||/role=["']main["']/i.test(html);
