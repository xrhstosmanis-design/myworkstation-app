import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createServer} from 'node:http';
import {createProductionStoreReadDiagnostic} from '../src/production-store-read-diagnostic.js';
const store='cmulmjjoc000qqlbf2bn2ifj0',company='cmulmjjoa000oqlbfyi0h53ju';
const path=`/api/transactions/stores/${store}/overview`;
const user={companyId:company,role:'OWNER',tokenType:'BACKOFFICE_USER'};
function complete(observer,{url=path,method='GET',status=404,identity=user}={}){
  const res=new EventEmitter();res.statusCode=status;
  let next=0;observer({method,originalUrl:url,user:identity},res,()=>next++);
  assert.equal(next,1);res.emit('finish');return res;
}
test('real failed HTTP response remains unchanged and known scope is attributable',async()=>{
  const logs=[];const observer=createProductionStoreReadDiagnostic({log:(_prefix,value)=>logs.push(JSON.parse(value))});
  const server=createServer((req,res)=>{req.originalUrl=req.url;observer(req,res,()=>{req.user=user;res.statusCode=404;res.end('ordinary denied response')})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`);assert.equal(response.status,404);assert.equal(await response.text(),'ordinary denied response');assert.equal(logs.length,1);assert.equal(logs[0].requestedStoreId,store);assert.equal(logs[0].companyId,company)}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
test('only authenticated GET404 on the two polling routes is observed',()=>{
  const logs=[];const observer=createProductionStoreReadDiagnostic({log:(...v)=>logs.push(v)});
  for(const options of [{status:200},{status:401},{status:403},{status:500},{identity:null},{method:'POST'},{url:'/api/private/customer@example.com'},{url:path+'/attachment'},{url:'/api/cloud/v1/device/changes'}])complete(observer,options);
  assert.equal(logs.length,0);
  complete(observer,{url:`/api/cloud/v1/stores/${store}/overview`});assert.equal(logs.length,1);
});
test('unknown scope and private values never enter output',()=>{
  const logs=[];const observer=createProductionStoreReadDiagnostic({log:(_p,v)=>logs.push(v)});
  complete(observer,{url:'/api/transactions/stores/private@example.com/overview?token=SECRET&employee=PRIVATE',identity:{companyId:'private-company',storeId:'private-user',role:'private-role',tokenType:'private-token',id:'PRIVATE',sessionId:'SECRET',supportContext:{storeId:'private-support'},authorization:'SECRET'}});
  assert.equal(logs.length,1);assert.equal(/SECRET|PRIVATE|private|example/.test(logs[0]),false);
  assert.equal(JSON.parse(logs[0]).requestedStoreId,'OTHER_OR_MISSING');
});
test('high frequency failures yield one sample and bounded minute rollup without timers',()=>{
  let time=100000;const logs=[];const observer=createProductionStoreReadDiagnostic({now:()=>time,log:(_p,v)=>logs.push(JSON.parse(v))});
  for(let i=0;i<10000;i++)complete(observer);
  assert.equal(logs.length,1);time+=60000;complete(observer);
  assert.equal(logs.length,2);assert.equal(logs[1].kind,'window');assert.equal(logs[1].records[0].count,10000);
  assert.equal(logs[1].overflow,0);assert.equal(logs[1].windowStart,new Date(100000).toISOString());
});
test('distinct scope flood bounds memory and log output while counting overflow',()=>{
  let time=100000;const logs=[];const observer=createProductionStoreReadDiagnostic({now:()=>time,log:(_p,v)=>logs.push(JSON.parse(v))});
  const ids=['cmtpopbgo000trhb5ng9ytiru','cmuk8gxui000ppabfykdxwb1y','cmulj8rg5000qnrbfxi5sj6xl',store,'cmv25lf3h000ueegf0kkii3pb','cmv2qanca000psigeizep8o9m','kat-store'];
  for(const id of ids)for(const credentialStoreId of ids)complete(observer,{url:`/api/transactions/stores/${id}/overview`,identity:{...user,storeId:credentialStoreId}});
  time+=60000;complete(observer);assert.equal(logs.length,2);assert.equal(logs[1].records.length,32);assert.equal(logs[1].overflow,17);assert.ok(JSON.stringify(logs[1]).length<20000);
});
test('logging, malformed context and clock errors do not alter completion or next',()=>{
  const observer=createProductionStoreReadDiagnostic({log:()=>{throw Error('offline logger')}});assert.doesNotThrow(()=>complete(observer));
  assert.doesNotThrow(()=>complete(observer,{identity:{get companyId(){throw Error('malformed')}}}));
  assert.doesNotThrow(()=>complete(createProductionStoreReadDiagnostic({now:()=>NaN})));
  const res=complete(observer,{url:'x'.repeat(2050)});assert.equal(res.listenerCount('finish'),0);
});
