// Commercial claims are evidence of what a storefront *says*, not proof
// that delivery dates, shipping costs or returns are actually honored.
export function findWebshopClaims(text: string): string[] {
  const pattern = /(?:snelle levering|(?:gratis|kosteloos)\s+(?:verzending|bezorg(?:ing|d)|retourneren|retour(?:zending)?|returns?)|(?:free|next.day)\s+(?:shipping|delivery|returns?)|(?:voor|vóór|before)\s*\d{1,2}(?:[.:]\d{2})?\s*(?:u(?:ur)?|h|pm|am)?\s*(?:besteld|ordered)|(?:morgen|tomorrow|volgende\s+dag|next\s+day)\s+(?:gratis\s+)?(?:bezorgd|geleverd|delivered)|\d{1,3}\s*dagen?\s*(?:gratis\s+)?retour|free\s+returns?)/gi;
  return [...new Set((text.match(pattern) || []).map(x=>x.trim()))].slice(0,12);
}
