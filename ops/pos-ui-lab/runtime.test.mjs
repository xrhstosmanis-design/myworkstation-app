import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {startPreview,sourceRevision} from './runtime.mjs';

test('visual LAB exposes only exact assets and health; every write and business route is denied',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'pos-visual-lab-'));
  for(const name of ['index.html','lab.js','lab.css'])await writeFile(path.join(directory,name),name);
  let runtime;
  try{
    runtime=await startPreview({port:0,host:'127.0.0.1',directory,environment:{}});
    const base='http://127.0.0.1:'+runtime.server.address().port;
    const health=await fetch(base+'/api/health');assert.equal(health.status,200);
    assert.deepEqual({...await health.json(),revision:'ignored'},{ok:true,testOnly:true,mode:'visual-only',sourceRevision,revision:'ignored',database:false,transactions:false,providers:false});
    assert.match(health.headers.get('content-security-policy'),/connect-src 'self'/);
    assert.match(health.headers.get('content-security-policy'),/form-action 'none'/);
    assert.match(health.headers.get('permissions-policy'),/camera=\(\)/);
    for(const route of ['/','/lab.js','/lab.css'])assert.equal((await fetch(base+route)).status,200);
    for(const route of ['/api/store-pos/stores/real/checkout','/api/auth/login','/server/.env','/lab.js/extra','/api/netlink/status'])assert.equal((await fetch(base+route)).status,404);
    for(const method of ['POST','PUT','PATCH','DELETE'])for(const route of ['/','/api/health','/api/store-pos/stores/real/checkout']){
      const response=await fetch(base+route,{method});assert.equal(response.status,405);assert.equal((await response.json()).code,'VISUAL_LAB_WRITE_DENIED');
    }
    const malformed=await new Promise((resolve,reject)=>{const request=http.request(base,{path:'http://[',method:'GET'},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);request.end();});
    assert.equal(malformed,400);
  }finally{await runtime?.close();await rm(directory,{recursive:true,force:true});}
});

test('inherited credentials refuse startup before opening files or listening, without printing values',async()=>{
  for(const key of ['DATABASE_URL','SUPABASE_SERVICE_KEY','PGHOST','AZURE_OPENAI_KEY','SENDGRID_API_KEY','VAPID_PRIVATE_KEY']){
    await assert.rejects(startPreview({port:0,directory:'/does-not-exist',environment:{[key]:'secret-that-must-never-be-printed'}}),error=>error.message==='POS visual LAB refuses inherited application credentials.');
  }
});
