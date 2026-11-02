"use client";
const DB="rankfix-testlab-audits";
const STORE="audits";
function openDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  // Version 2: an export page that opened the database before any audit existed
  // could leave an empty version-1 database without the store; the upgrade
  // (re)creates the store and never deletes stored audits.
  const request=indexedDB.open(DB,2);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:"id"});};
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
  request.onerror=()=>reject(request.error);
  // Another open TestLab tab holds the old version: fail visibly, never hang the run.
  request.onblocked=()=>reject(new Error("QA-opslag geblokkeerd door een ander geopend TestLab-tabblad; sluit de andere tabbladen en herlaad deze pagina."));
 });
}
export async function saveQaAudit(id:string, result:unknown, host:string):Promise<void>{
 const db=await openDb();
 try{
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(STORE,"readwrite");
   tx.objectStore(STORE).put({id,host,createdAt:new Date().toISOString(),result});
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error);
   tx.onabort=()=>reject(tx.error);
  });
 }finally{db.close();}
}
export async function readQaAudit(id:string):Promise<{id:string;host:string;createdAt:string;result:any}|null>{
 const db=await openDb();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,"readonly");
  const request=tx.objectStore(STORE).get(id);
  request.onsuccess=()=>resolve(request.result??null);
  request.onerror=()=>reject(request.error);
 });}finally{db.close();}
}
