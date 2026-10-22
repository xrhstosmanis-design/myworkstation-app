import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {controlledRestore,createRenderClient,runChild,TARGET,ACK} from '../../ops/backup/restore-controlled.mjs';
const now='2026-10-22T10:00:00.000Z',notBefore='2026-10-22T21:00:00.000Z';
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'restore-test-')),archive=path.join(dir,'input.dump'),bytes=Buffer.from('trusted synthetic archive');fs.writeFileSync(archive,bytes);return {dir,archive,bytes,receipt:{v:1,serviceId:TARGET.serviceId,postgresId:TARGET.postgresId,sourceRevision:'a'.repeat(40),archiveBytes:bytes.length,archiveSha256:createHash('sha256').update(bytes).digest('hex'),expiresAt:'2026-10-22T11:00:00.000Z'}};}
async function harness(run,{instances=[],deployStatus='live',dropControl=false,wrongDatabase=false}={}){
  const calls=[],children=[];let control,suspended=false;
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;calls.push([req.method,req.url,body]);
    assert.equal(req.headers.authorization,'Bearer isolated-token');
    let result;
    if(req.url.endsWith('/connection-info'))result={externalConnectionString:`postgresql://myworkstation:synthetic-password@${TARGET.postgresId}.oregon-postgres.render.com/${wrongDatabase?'foreign':'myworkstation'}`};
    else if(req.url===`/postgres/${TARGET.postgresId}`)result={id:TARGET.postgresId,owner:{id:TARGET.workspaceId},databaseName:TARGET.databaseName,databaseUser:TARGET.databaseUser,version:'18',status:'available'};
    else if(req.url.endsWith('/env-vars/AUTOMATIC_REPORT_ACTIVATION_CONTROL')){if(req.method==='PUT')control=JSON.parse(body).value;result={value:dropControl?'invalid':control};}
    else if(req.url.endsWith('/suspend')){suspended=true;result=null;}
    else if(req.url.endsWith('/instances'))result=instances;
    else if(req.url.includes('/deploys?'))result=[{deploy:{status:deployStatus}}];
    else result={id:TARGET.serviceId,ownerId:TARGET.workspaceId,type:'web_service',autoDeploy:'no',suspended:suspended?'suspended':'not_suspended'};
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await run({api:createRenderClient({token:'isolated-token',base:`http://127.0.0.1:${server.address().port}`}),calls,children,get control(){return control;},child:async(command,args,options)=>{
    children.push({command,args,env:options.env});assert.equal(options.env.HOME,undefined);assert.equal(options.env.PGOPTIONS,undefined);assert.equal(options.env.PGSSLMODE,'verify-full');
    if(command==='psql')return 'myworkstation|myworkstation|180003\n';
    assert.equal(command,'pg_restore');const buffer=Buffer.alloc(100);const count=fs.readSync(options.fd,buffer,0,100,null);return buffer.subarray(0,count).toString();
  }});}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
test('dry run validates digest offline with zero API/process/config calls',async()=>{
  const f=fixture();try{const result=await controlledRestore({...f,notBefore,clock:()=>now,api:()=>assert.fail('API called'),child:()=>assert.fail('child called')});assert.equal(result.mutations,0);assert.equal(result.mode,'DRY_RUN');await assert.rejects(controlledRestore({...f,receipt:{...f.receipt,archiveSha256:'0'.repeat(64)},notBefore,clock:()=>now}));}finally{fs.rmSync(f.dir,{recursive:true});}
});
test('actual HTTP boundary OFF/readback/suspend/two proofs precedes exact immutable archive process; never resume',async()=>{
  const f=fixture();try{await harness(async h=>{
    const child=async(...args)=>{if(args[0]==='pg_restore'){fs.writeFileSync(f.archive,'changed original');assert.ok(args[1].includes('--single-transaction'));const bytes=await h.child(...args);assert.equal(bytes,f.bytes.toString());return bytes;}return h.child(...args);};
    const result=await controlledRestore({...f,notBefore,execute:true,acknowledge:ACK,api:h.api,child,clock:()=>now});
    assert.equal(result.mode,'RESTORED_SUSPENDED_OFF');assert.equal(h.children.length,2);assert.equal(JSON.parse(h.control).enabled,false);
    assert.equal(h.calls.some(([,url])=>url.includes('resume')),false);
    assert.ok(h.calls.filter(([,url])=>url.endsWith('/instances')).length>=4);
    assert.deepEqual(h.calls.filter(([method])=>method==='POST').map(([,url])=>url),[`/services/${TARGET.serviceId}/suspend`]);
  });}finally{fs.rmSync(f.dir,{recursive:true});}
});
test('actual isolated child inherits only supplied env, consumes fd, and redacts failure/output overflow/timeout',async()=>{
  const f=fixture();const fd=fs.openSync(f.archive,'r');
  try{
    const output=await runChild(process.execPath,['-e',`const fs=require('fs');process.stdout.write(JSON.stringify({bytes:fs.readFileSync(0,'utf8'),keys:Object.keys(process.env)}));`],{fd,env:{ISOLATED_TEST:'yes'},timeout:5000});
    assert.deepEqual(JSON.parse(output),{bytes:f.bytes.toString(),keys:['ISOLATED_TEST']});
    for(const [script,timeout] of [[`console.error('synthetic-secret');process.exit(1)`,5000],[`process.stdout.write('x'.repeat(70000))`,5000],[`setInterval(()=>{},1000)`,100]]){
      await assert.rejects(runChild(process.execPath,['-e',script],{env:{},timeout}),error=>error.message==='CONTROLLED_RESTORE_REFUSED'&&!error.message.includes('synthetic-secret'));
    }
  }finally{fs.closeSync(fd);fs.rmSync(f.dir,{recursive:true});}
});
test('foreign target, missing OFF readback, live instances and pending deployment all refuse before any process',async()=>{
  for(const variant of [{wrongDatabase:true},{dropControl:true},{instances:[{id:'still-running'}]},{deployStatus:'update_in_progress'},{deployStatus:'unknown-new-status'}]){
    const f=fixture();try{await harness(async h=>{await assert.rejects(controlledRestore({...f,notBefore,execute:true,acknowledge:ACK,api:h.api,child:h.child,clock:()=>now}));assert.equal(h.children.length,0);assert.equal(h.calls.some(([,url])=>url.includes('resume')),false);},variant);}finally{fs.rmSync(f.dir,{recursive:true});}
  }
});
test('expired receipt/ack mismatch never reaches API; process failure remains suspended OFF',async()=>{
  const f=fixture();try{
    await assert.rejects(controlledRestore({...f,notBefore,execute:true,acknowledge:'wrong',clock:()=>now,api:()=>assert.fail('API called')}));
    await assert.rejects(controlledRestore({...f,receipt:{...f.receipt,expiresAt:now},notBefore,clock:()=>now}));
    await harness(async h=>{await assert.rejects(controlledRestore({...f,notBefore,execute:true,acknowledge:ACK,api:h.api,child:async()=>{throw new Error('synthetic child failure');},clock:()=>now}));assert.equal(JSON.parse(h.control).enabled,false);assert.equal(h.calls.some(([,url])=>url.includes('resume')),false);});
  }finally{fs.rmSync(f.dir,{recursive:true});}
});
