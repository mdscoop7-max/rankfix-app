// Node 24 operator alias resolution only. No DNS, authentication, database or browser stubs.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
registerHooks({resolve(spec,context,next){
 const base=spec.startsWith('@/')?root+spec.slice(2):spec.startsWith('.')&&context.parentURL?.startsWith('file:')?fileURLToPath(new URL(spec,context.parentURL)):null;
 if(base) {const file=[base,base+'.ts',base+'.mjs',base+'.js',base+'/index.ts'].find(p=>/\.[a-z]+$/i.test(p)&&existsSync(p));if(file)return {url:pathToFileURL(file).href,shortCircuit:true};}
 return next(spec,context);
}});
