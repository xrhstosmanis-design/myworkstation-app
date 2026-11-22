import test from 'node:test';
import assert from 'node:assert/strict';
import {historyCursor,readWalletHistoryPage} from '../src/services/ai-wallet-history.js';

test('history binds exact scope and full precision cursor, strips internal timestamp and never writes',async()=>{
 const rows=Array.from({length:101},(_,i)=>({id:'history-'+i,cursorCreatedAt:'2026-11-03T12:00:00.123456Z',chargedMicros:0n}));
 const calls=[],db={$queryRaw:async(strings,...values)=>{calls.push({sql:strings.join('?'),values});return rows}};
 const page=await readWalletHistoryPage(db,'company','selected');
 assert.equal(page.entries.length,100);assert.equal(page.entries[0].cursorCreatedAt,undefined);
 const cursor=historyCursor({companyId:'company',storeId:'selected'},page.nextCursor);
 assert.equal(cursor.id,'history-99');assert.equal(cursor.createdAt,'2026-11-03T12:00:00.123456Z');
 await readWalletHistoryPage(db,'company','selected',page.nextCursor);
 assert.deepEqual(calls[1].values,['company','selected','selected',cursor.createdAt,cursor.createdAt,cursor.id]);
 assert.match(calls[1].sql,/LIMIT 101/);assert.match(calls[1].sql,/ORDER BY e\."createdAt" DESC,e\."id" DESC/);
 for(const scope of [{companyId:'foreign',storeId:'selected'},{companyId:'company',storeId:null},{companyId:'company',storeId:''}])await assert.rejects(readWalletHistoryPage(db,scope.companyId,scope.storeId,page.nextCursor),{code:'AI_WALLET_INVALID_INPUT'});
 assert.equal(calls.length,2);
 for(const mutation of [{v:2},{id:'bad id'},{createdAt:'2026-02-30T12:00:00.123456Z'},{createdAt:'2026-11-03T12:00:00.123Z'},{extra:true}]){
  const raw=Buffer.from(JSON.stringify({...cursor,...mutation})).toString('base64url');
  assert.throws(()=>historyCursor({companyId:'company',storeId:'selected'},raw),{code:'AI_WALLET_INVALID_INPUT'});
 }
 for(const raw of ['', 'a'.repeat(4097),'%%%','bnVsbA'])assert.throws(()=>historyCursor({companyId:'company',storeId:'selected'},raw),{code:'AI_WALLET_INVALID_INPUT'});
 const end=await readWalletHistoryPage({$queryRaw:async()=>rows.slice(0,100)},'company');assert.equal(end.nextCursor,null);
});
