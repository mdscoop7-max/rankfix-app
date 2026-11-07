import {readFileSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';import {resolve,dirname,sep} from 'node:path';
import {validateMkbCatalog} from '../../lib/testlab-catalog-validation.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),req=JSON.parse(readFileSync(resolve(root,'tests/fixtures/testlab-mkb/requirements.json')));
const [catalogPath=resolve(root,'tests/fixtures/testlab-mkb/catalog.json'),baselinePath=resolve(root,'qa-input/'+req.baselineFilename)]=process.argv.slice(2);
const missing=[catalogPath,baselinePath].filter(p=>!existsSync(p));
if(missing.length){console.log('TESTLAB_CATALOG_RESULT '+JSON.stringify({structurallyValid:false,activationAllowed:false,problems:['REQUIRED_INPUT_MISSING'],missing}));process.exitCode=1;}
else{
 const catalog=JSON.parse(readFileSync(catalogPath)),baseline=JSON.parse(readFileSync(baselinePath));
 const result=validateMkbCatalog(catalog,baseline,req,{verifyEvidence(e,host){try{const dir=dirname(resolve(catalogPath)),file=resolve(dir,e.reference);if(!file.startsWith(dir+sep)||!e.sha256)return false;const raw=readFileSync(file);return createHash('sha256').update(raw).digest('hex')===e.sha256&&raw.toString().includes(host);}catch{return false;}}});
 console.log('TESTLAB_CATALOG_RESULT '+JSON.stringify(result));process.exitCode=result.structurallyValid?0:1;
}
