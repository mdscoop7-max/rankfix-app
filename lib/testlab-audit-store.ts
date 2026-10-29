"use client";
const DB="rankfix-testlab-audits";
const STORE="audits";
function openDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:"id"});};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
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
