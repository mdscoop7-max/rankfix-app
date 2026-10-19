import {NextResponse} from "next/server";
import {runRestrictedQaScan} from "../scan/route";

export const runtime="nodejs";
export const maxDuration=300;

export async function POST(request:Request){
 const origin=request.headers.get("origin"), host=request.headers.get("host");
 if(origin){try{if(new URL(origin).host!==host)return NextResponse.json({error:"Niet toegestaan."},{status:403});}catch{return NextResponse.json({error:"Ongeldige aanvraag."},{status:403});}}
 let body:{url?:unknown,language?:unknown};try{body=await request.json()}catch{return NextResponse.json({error:"Ongeldige invoer."},{status:400})}
 if(typeof body.url!=="string")return NextResponse.json({error:"Kies een website."},{status:400});
 let url:URL;try{url=new URL(body.url.startsWith("http")?body.url:"https://"+body.url)}catch{return NextResponse.json({error:"Ongeldige URL."},{status:400})}
 if(!["https:","http:"].includes(url.protocol)||url.username||url.password||url.port)return NextResponse.json({error:"Gebruik een openbare http(s)-website zonder aparte poort."},{status:400});
 const synthetic=new Request(request.url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url:url.toString(),mode:"both",language:body.language==="en"?"en":"nl",dashboard:false})});
 const result=await runRestrictedQaScan(synthetic);
 if(!result.ok)return result;
 const data=await result.json();
 return NextResponse.json({...data,qaExecution:"restricted-real-engine",qaSaved:false,qaNotice:"Volledige RankFix-audit op een afgeschermde testlijst. Deze scan wordt niet in de database opgeslagen; download het rapport lokaal."},{headers:{"Cache-Control":"no-store"}});
}