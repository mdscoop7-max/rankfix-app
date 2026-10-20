/** Lightweight, browser-only PDF for real stateless RankFix scans.
 * No third-party service, no database, no raw JSON dump, no fake scan results.
 */
import { qaAuditFilename } from "./qa-audit-export";

type Check = {
  status: string;
  title?: string;
  message?: string;
  fix?: string;
  evidence?: { details?: string };
};
export type QaAuditResult = {
  scannedUrl?: string;
  scannedAt?: string;
  finalUrl?: string;
  overallScore?: number;
  grade?: string;
  seo?: { score?: number; checks?: Check[] };
  geo?: { score?: number; checks?: Check[] };
  security?: { score?: number };
  sectorProfile?: { label?: string; sector?: string; confidence?: number | string };
  classification?: { sector?: string; websiteType?: string; confidence?: number };
  coverage?: { coveragePercent?: number; relevant?: number; confirmed?: number; unableToConfirm?: number };
  scoreModel?: { provisional?: boolean; evidenceLevel?: string; evidenceReasons?: string[]; headline?: { kind?: string; display?: string } };
  selfCheck?: { reliability?: string };
  multiPage?: { counts?: { audited?: number; selected?: number } };
};
const CP1252: Record<number, number> = {
  0x20ac:0x80,0x201a:0x82,0x0192:0x83,0x201e:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,
  0x02c6:0x88,0x2030:0x89,0x0160:0x8a,0x2039:0x8b,0x0152:0x8c,0x017d:0x8e,0x2018:0x91,
  0x2019:0x92,0x201c:0x93,0x201d:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02dc:0x98,
  0x2122:0x99,0x0161:0x9a,0x203a:0x9b,0x0153:0x9c,0x017e:0x9e,0x0178:0x9f
};
function winAnsi(text: string): number[] {
  const normalized = text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").replace(/[\u200b-\u200d]/g, "").replace(/[\u2190-\u21ff]/g, "-");
  const out: number[] = [];
  for (const char of normalized) {
    const code = char.codePointAt(0) || 0;
    out.push(code >= 32 && code <= 126 || code >= 160 && code <= 255 ? code : CP1252[code] || 63);
  }
  return out;
}
function latin(text: string): Uint8Array {
  // Preserve PDF syntax newlines and already-encoded WinAnsi character bytes.
  return Uint8Array.from(Array.from(text, c=>{const code=c.codePointAt(0)||0; return code<=255?code:CP1252[code]||63;}));
}
function escapePdf(text: string): string {
  return String.fromCharCode(...winAnsi(text)).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s,p)=>s+p.length,0);
  const out = new Uint8Array(total); let pos=0;
  for (const p of parts) { out.set(p,pos);pos+=p.length; }
  return out;
}
function short(text: unknown, max=440): string {
  if (typeof text !== "string") return "";
  const clean=text.replace(/\s+/g," ").trim();
  return clean.length>max ? clean.slice(0,max-3)+"..." : clean;
}
function wrap(text: string, fontSize: number, width=494): string[] {
  const max = Math.max(12,Math.floor(width/(fontSize*0.53)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[]=[]; let line="";
  for (let word of words) {
    while (word.length>max) {
      if (line) { lines.push(line);line=""; }
      lines.push(word.slice(0,max)); word=word.slice(max);
    }
    if (!word) continue;
    if ((line+" "+word).trim().length>max && line) {lines.push(line);line=word;}
    else line=line?line+" "+word:word;
  }
  if (line) lines.push(line);
  return lines.length?lines:[""];
}
function pdfObjects(objects: Uint8Array[], root: number): Uint8Array {
  const output: Uint8Array[]=[latin("%PDF-1.4\n")]; let offset=output[0].length;const locations=[0];
  for (let n=1;n<objects.length;n++) {
    locations.push(offset);
    const part=concat([latin(n+" 0 obj\n"),objects[n],latin("\nendobj\n")]);
    output.push(part);offset+=part.length;
  }
  const xref=offset;
  const rows=["xref","0 "+objects.length,"0000000000 65535 f "];
  for(let n=1;n<objects.length;n++) rows.push(String(locations[n]).padStart(10,"0")+" 00000 n ");
  rows.push("trailer","<< /Size "+objects.length+" /Root "+root+" 0 R >>","startxref",String(xref),"%%EOF");
  output.push(latin(rows.join("\n")+"\n"));
  return concat(output);
}
export function buildQaAuditPdf(result: QaAuditResult, url: string, language="nl"): Uint8Array {
  const nl=language==="nl";
  const pages: string[][]=[[]]; let y=789; let page=pages[0];
  const add=(command:string)=>page.push(command);
  const newPage=()=>{page=[];pages.push(page);y=791;};
  const line=(content:unknown,opts:{size?:number;bold?:boolean;rgb?:string;indent?:number;space?:number}={})=>{
    const size=opts.size||10, gap=size*1.42, indent=opts.indent||0;
    for (const part of wrap(short(content,800),size,494-indent)) {
      if(y-gap<70)newPage();
      const rgb=opts.rgb||"0.12 0.18 0.27";
      add("BT /"+(opts.bold?"F2":"F1")+" "+size+" Tf "+rgb+" rg "+(50+indent)+" "+y.toFixed(2)+" Td ("+escapePdf(part)+") Tj ET");
      y-=gap;
    }
    y-=opts.space||0;
  };
  const section=(title:string)=>{
    if(y<116)newPage();
    y-=13;
    add("0.92 0.95 0.98 rg 47 "+(y-11).toFixed(2)+" 502 28 re f");
    line(title,{size:12,bold:true,indent:9,space:10,rgb:"0.08 0.17 0.31"});
  };
  const host=(()=>{try{return new URL(url).hostname;}catch{return url;}})();
  const scanDate=result.scannedAt||new Date().toISOString();
  const all:Check[]=[...(result.seo?.checks||[]),...(result.geo?.checks||[])];
  const problems=all.filter(c=>c.status==="fail"||c.status==="warning");
  const unconfirmed=all.filter(c=>c.status==="unable_to_confirm");
  const passed=all.filter(c=>c.status==="pass");
  const notApplicable=all.filter(c=>c.status==="not_applicable");
  const shownScore=result.scoreModel?.headline?.display || (typeof result.overallScore==="number"?String(result.overallScore):"-");
  const sector=result.sectorProfile?.label||result.classification?.sector||(nl?"Sector niet bevestigd":"Sector not confirmed");
  const rawConfidence=result.sectorProfile?.confidence??result.classification?.confidence;
  const confidence=typeof rawConfidence==="number"&&Number.isFinite(rawConfidence)?" ("+(rawConfidence<=1?Math.round(rawConfidence*100):Math.round(rawConfidence))+"%)":"";
  // Header and main decision summary.
  add("0.04 0.12 0.25 rg 0 814 595 28 re f");
  y=787;
  line("RANKFIX  /  "+(nl?"AUDITRAPPORT":"AUDIT REPORT"),{size:17,bold:true,rgb:"0.05 0.13 0.26",space:8});
  line(host,{size:14,bold:true,space:6});
  line((nl?"Scanmoment: ":"Scanned: ")+scanDate.slice(0,19).replace("T","  ")+
    "   |   "+(nl?"Bron: echte scan":"Source: real scan"),{size:9,space:8});
  line((nl?"Eindscore: ":"Overall score: ")+shownScore+
    (typeof result.overallScore==="number"&&result.scoreModel?.headline?.kind!=="range"?"/100":"")+
    "   |   SEO: "+(result.seo?.score??"-")+
    "   |   GEO: "+(result.geo?.score??"-")+
    "   |   Security: "+(result.security?.score??"-"),{size:11,bold:true,space:7});
  line((nl?"Herkende sector: ":"Detected sector: ")+sector+confidence,{size:10,space:4});
  line((nl?"Aandachtspunten: ":"Issues: ")+problems.length+
    "   |   "+(nl?"Onbevestigd: ":"Unconfirmed: ")+(result.coverage?.unableToConfirm??unconfirmed.length)+
    "   |   "+(nl?"Geslaagd: ":"Passed: ")+passed.length,{size:10,space:5});
  if (typeof result.coverage?.coveragePercent==="number")
    line((nl?"Bewijsdekking: ":"Evidence coverage: ")+result.coverage.coveragePercent+"%",{size:10,space:5});
  const qualifier=result.scoreModel?.evidenceLevel|| (result.scoreModel?.provisional?"provisional":"");
  if (qualifier==="provisional"||qualifier==="insufficient")
    line(nl?"VOORLOPIGE SCORE: niet alle toepasselijke controles konden bevestigd worden.":"PROVISIONAL SCORE: not every applicable check could be confirmed.",{size:10,bold:true,rgb:"0.55 0.22 0.08",space:6});
  for (const reason of (result.scoreModel?.evidenceReasons||[]).slice(0,5)) line("- "+short(reason,300),{size:9,space:2});
  section(nl?"Belangrijkste verbeterpunten":"Issues and recommended actions");
  if(!problems.length) line(nl?"Geen bevestigde fouten of waarschuwingen in deze scan.":"No confirmed errors or warnings in this scan.");
  for (const [i,c] of problems.entries()) {
    line((i+1)+". ["+(c.status==="fail"?"FOUT":"LET OP")+"] "+(c.title||"Controle"),{size:10,bold:true,space:2});
    if(c.message) line(short(c.message,420),{size:9,indent:12,space:2});
    if(c.fix) line((nl?"Advies: ":"Action: ")+short(c.fix,400),{size:9,indent:12,space:6});
    if(c.evidence?.details) line((nl?"Bewijs: ":"Evidence: ")+short(c.evidence.details,260),{size:8,indent:12,space:6});
  }
  section(nl?"Niet te bevestigen - geen bewezen fouten":"Unable to confirm - not proven errors");
  if(!unconfirmed.length) line(nl?"Geen onbevestigde controles in SEO en GEO.":"No unconfirmed SEO/GEO checks.");
  for(const [i,c] of unconfirmed.entries()) {
    line((i+1)+". "+(c.title||"Controle"),{size:9,bold:true,space:1});
    if(c.message)line(short(c.message,220),{size:8,indent:12,space:3});
  }
  section(nl?"Geslaagde controles":"Passed checks");
  if (!passed.length) line("-");
  for (const c of passed) line("- "+(c.title||"Controle"),{size:9});
  section(nl?"Niet van toepassing":"Not applicable");
  if (!notApplicable.length) line("-");
  for (const c of notApplicable) line("- "+(c.title||"Controle"),{size:9});
  section(nl?"Methode en beperkingen":"Method and limits");
  line(nl?
    "Dit PDF-rapport is een leesbare samenvatting van de echte scan. Onbevestigde controles zijn geen bewezen fouten en tellen niet als geslaagd. Een hoge score garandeert geen rankings of vermelding in AI-zoekmachines.":
    "This PDF summarizes the real scan. Unconfirmed checks are neither proven failures nor passes. A high score does not guarantee search rankings or AI citations.",{size:9,space:5});
  line((nl?"Gescande URL: ":"Scanned URL: ")+(result.finalUrl||result.scannedUrl||url),{size:9});
  if(result.multiPage?.counts?.audited!=null)
    line((nl?"Gescande pagina's: ":"Pages audited: ")+result.multiPage.counts.audited+
      (result.multiPage.counts.selected!=null?" / "+result.multiPage.counts.selected:""),{size:9});
  const objects:Uint8Array[]=[new Uint8Array()];
  const addObj=(raw:Uint8Array|string)=>{objects.push(typeof raw==="string"?latin(raw):raw);return objects.length-1;};
  const regular=addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const bold=addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pagesIndex=addObj("");
  const kids:number[]=[];
  for (let index=0;index<pages.length;index++) {
    const cmds=pages[index].slice();
    cmds.push("0.66 0.7 0.76 RG 48 53 m 547 53 l S");
    cmds.push("BT /F1 8 Tf 0.40 0.47 0.56 rg 48 37 Td (RankFix - "+
      escapePdf(nl?"Bewijsgericht auditrapport":"Evidence-based audit")+") Tj ET");
    cmds.push("BT /F1 8 Tf 0.40 0.47 0.56 rg 490 37 Td ("+(index+1)+" / "+pages.length+") Tj ET");
    const bytes=latin(cmds.join("\n")+"\n");
    const stream=addObj(concat([latin("<< /Length "+bytes.length+" >>\nstream\n"),bytes,latin("endstream")]));
    const pageObj=addObj("<< /Type /Page /Parent "+pagesIndex+" 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 "+regular+" 0 R /F2 "+bold+" 0 R >> >> /Contents "+stream+" 0 R >>");
    kids.push(pageObj);
  }
  objects[pagesIndex]=latin("<< /Type /Pages /Kids ["+kids.map(n=>n+" 0 R").join(" ")+"] /Count "+kids.length+" >>");
  const root=addObj("<< /Type /Catalog /Pages "+pagesIndex+" 0 R >>");
  return pdfObjects(objects,root);
}
export function downloadQaAuditPdf(result: QaAuditResult, scannedUrl: string, language="nl"): void {
  const file=buildQaAuditPdf(result,scannedUrl,language);
  const blob=new Blob([new Uint8Array(file)],{type:"application/pdf"});
  const objectUrl=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=objectUrl;
  link.download=qaAuditFilename(result.scannedUrl||scannedUrl,result.scannedAt).replace(/\.json$/,".pdf");
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}
