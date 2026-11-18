import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

test('independent legacy package imports company authorization without optional recovery sources or ops assets',async()=>{
 const root=await mkdtemp(join(tmpdir(),'company-legacy-import-'));
 try{
  const services=join(root,'server','src','services');await mkdir(services,{recursive:true});await writeFile(join(root,'package.json'),'{"type":"module"}');
  for(const name of ['backoffice-company-profile.js','backoffice-company-compatibility.js'])await copyFile(new URL('../src/services/'+name,import.meta.url),join(services,name));
  const source=`import assert from 'node:assert/strict';
const {backofficeCompanyProfile,isBackofficeCompanyInstalled}=await import(${JSON.stringify(pathToFileURL(join(services,'backoffice-company-profile.js')).href)});
const db=new Proxy({},{get(){throw Error('Legacy import/readiness must not touch any database boundary')}});
for(const profile of [undefined,'BASE','MONTHLY_INVENTORY_CAPTURE_V1','AUTOMATIC_EVENT_REPORTS_V1','MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1']){
 const env={MWS_STORE_LIFECYCLE_PROFILE:profile};assert.equal(backofficeCompanyProfile(env),null);assert.equal(await isBackofficeCompanyInstalled(db,{env}),false);
}
for(const profile of ['BACKOFFICE_COMPANY_BASE_V1','BACKOFFICE_COMPANY_CAPTURE_V1','BACKOFFICE_COMPANY_CURRENT_CAPTURE_V1'])assert.equal(await isBackofficeCompanyInstalled(db,{env:{MWS_STORE_LIFECYCLE_PROFILE:profile}}),false,'missing explicit company package must fail closed');
console.log('ISOLATED_LEGACY_IMPORT_PASS');`;
  const child=spawnSync(process.execPath,['--input-type=module','--eval',source],{encoding:'utf8',cwd:root,timeout:15000,maxBuffer:16000});
  assert.equal(child.status,0,(child.stderr||child.stdout).slice(-8000));assert.match(child.stdout,/ISOLATED_LEGACY_IMPORT_PASS/);
 }finally{await rm(root,{recursive:true,force:true})}
});
