type Concept={type:string;pattern:RegExp};
const family=(t:string)=>/Clinic|Dentist|Physiotherapy|Pharmacy|Veterinary/.test(t)?'health':/Plumber|Electrician|Contractor/.test(t)?'trade':/Hairdresser|BeautySalon/.test(t)?'beauty':t;
/** A mismatch is only a review signal: two metadata fields disagree with two content headings. */
export function metadataTopicMismatch(title:string,description:string,h1s:string[],h2s:string[],concepts:Concept[]):boolean{
 const classify=(text:string)=>{
  const found=new Set(concepts.filter(c=>c.pattern.test(text)).map(c=>family(c.type)));
  if(/\b(?:dental|orthodont\w*)\b/i.test(text))found.add('health');
  if(/\bplumb(?:ing|er|ers)\b/i.test(text))found.add('trade');
  return found.size===1?[...found][0]:null;
 };
 const t=classify(title),d=classify(description),h=classify(h1s.join(' ')),sub=classify(h2s.join(' '));
 return Boolean(t&&d&&h&&sub&&t===d&&h===sub&&t!==h);
}
