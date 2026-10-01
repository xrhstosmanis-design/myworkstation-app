import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPendingSources} from '../../client/src/components/commerce/pending-sources.mjs';
const stores=[{id:'a',name:'LAB'},{id:'b',name:'Control'}];
const modules=['DOCUMENTS','INVENTORY'];
test('combines pending source statuses, excludes settled/untracked stock and uses read-only store-scoped calls',async()=>{
 const calls=[];
 const api=async(path,options)=>{calls.push([path,options]);if(path.includes('archive'))return {items:[{id:'i1',status:'RECEIVED'},{id:'i2',status:'PROCESSED'}],total:2};if(path.includes('settlements'))return {items:[{id:'p1',status:'DISCREPANCY',amount:10},{id:'p2',status:'CONFIRMED'}]};return {rows:[{id:'s1',trackStock:true,currentStock:-1,minStock:null},{id:'s2',trackStock:true,currentStock:2,minStock:2},{id:'s3',trackStock:false,currentStock:-1},{id:'s4',trackStock:true,currentStock:0,minStock:null}]}};
 const result=await loadPendingSources({api,stores,storeId:'a',modules});
 assert.deepEqual(result.rows.map(r=>r.sourceId),['p1','s1','i1','s2']);assert.equal(result.warnings.length,0);
 assert.ok(calls.every(([path,options])=>new URL(path,'https://test').searchParams.get('storeId')==='a'&&!options.method&&options.cache==='no-store'));
});
test('one denied source remains visible without discarding successful sources',async()=>{
 const api=async path=>{if(path.includes('settlements'))throw new Error('403');if(path.includes('archive'))return {items:[{id:'i',status:'IN_REVIEW'}],total:1};return {rows:[]}};
 const result=await loadPendingSources({api,stores,storeId:'b',modules});assert.equal(result.rows[0].storeId,'b');assert.match(result.warnings[0],/Control.*403/);
});
test('disabled modules do not call licensed sources or imply an empty complete queue',async()=>{
 const calls=[];const result=await loadPendingSources({api:async path=>{calls.push(path);return {items:[]}},stores:[stores[0]]});assert.equal(calls.length,1);assert.equal(result.warnings.length,2);
});
test('invoice pagination follows total, deduplicates page overlap and rejects incomplete pages',async()=>{
 const offsets=[];
 const api=async path=>{if(!path.includes('archive'))return {items:[]};const offset=Number(new URL(path,'https://test').searchParams.get('offset'));offsets.push(offset);return offset===0?{items:[{id:'i',status:'RECEIVED'}],total:3}:offset===1?{items:[{id:'i',status:'RECEIVED'}],total:3}:{items:[],total:3}};
 const result=await loadPendingSources({api,stores:[stores[0]],modules:['DOCUMENTS']});assert.deepEqual(offsets,[0,1,2]);assert.equal(result.rows.length,1);assert.ok(result.warnings.some(w=>w.includes('ατελής')));
});
test('all stores retain separate source identities and expose capped payment results',async()=>{
 const api=async()=>({items:Array.from({length:500},(_,i)=>({id:String(i),status:'PENDING_REVIEW'}))});
 const result=await loadPendingSources({api,stores});assert.equal(new Set(result.rows.map(r=>r.id)).size,1000);assert.equal(result.warnings.filter(w=>w.includes('500')).length,2);
});
test('invalid responses and unavailable stores do not become successful empty results',async()=>{
 const result=await loadPendingSources({api:async()=>({}),stores:[stores[0]],modules});assert.equal(result.rows.length,0);assert.equal(result.warnings.length,3);
 const unknown=await loadPendingSources({api:async()=>{throw Error('should not request')},stores,storeId:'foreign',modules});assert.equal(unknown.warnings.length,1);
});
