import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {declaredEftpos} from '../../shared/declared-eftpos.mjs';
import {verifyShiftCloseCredential} from '../src/services/shift-close-card.js';
import {workCardHash} from '../src/workforce-card-code.js';

const pin='2468',hash=await bcrypt.hash(pin,4),user={tokenType:'STORE_OPERATOR',id:'operator',operatorId:'operator',employeeId:'employee',companyId:'company',storeId:'store',terminalPos:'POS-1'},session={id:'shift',openedBy:'operator',companyId:'company',storeId:'store',terminalPos:'POS-1'};
function fixture({credentials=[{pinHash:hash}],guard=null}={}){
 const calls=[],state={guard};
 const tx={
  async $queryRaw(parts,...values){const sql=parts.join('?');calls.push({sql,values});if(sql.includes('FROM "StoreOperatorCredential"'))return sql.includes('"cardCodeHash"')?[{cardCodeHash:workCardHash('FIXTURE-CARD')}]:credentials;if(sql.includes('FROM "StoreOperatorLoginGuard"'))return state.guard?[state.guard]:[];throw Error('unexpected fixture query')},
  async $executeRaw(parts,...values){const sql=parts.join('?');calls.push({sql,values});if(sql.startsWith('INSERT INTO "StoreOperatorLoginGuard"'))state.guard||={failedCount:0,windowStartedAt:new Date(),lockedUntil:null};else if(sql.startsWith('UPDATE "StoreOperatorLoginGuard"'))state.guard={failedCount:values[0],windowStartedAt:values[1]?new Date():state.guard.windowStartedAt,lockedUntil:values[2]};else if(sql.startsWith('DELETE FROM "StoreOperatorLoginGuard"'))state.guard=null;else throw Error('unexpected fixture write');return 1}
 };
 return {tx,calls,state};
}

test('personal opener PIN authenticates with current bcrypt hash and clears only its guard',async()=>{
 const f=fixture({guard:{failedCount:2,windowStartedAt:new Date(),lockedUntil:null}});
 assert.deepEqual(await verifyShiftCloseCredential(f.tx,user,session,{closeCredentialMethod:'PIN',pin}),{ok:true,method:'PIN'});
 assert.equal(f.state.guard,null);assert.equal(f.calls.some(call=>call.values.some(value=>value===pin||value===hash)),false,'no raw PIN/hash is stored in guard SQL');
});

test('five wrong PIN results record a guard and the sixth is locked even for a correct PIN',async()=>{
 const f=fixture();
 for(let count=1;count<=5;count++){const result=await verifyShiftCloseCredential(f.tx,user,session,{closeCredentialMethod:'PIN',pin:'1357'});assert.equal(result.status,401);assert.equal(result.code,'SHIFT_CLOSE_PIN_INVALID');assert.equal(f.state.guard.failedCount,count)}
 const locked=await verifyShiftCloseCredential(f.tx,user,session,{closeCredentialMethod:'PIN',pin});assert.equal(locked.status,429);assert.equal(locked.code,'SHIFT_CLOSE_PIN_LOCKED');assert.equal(f.state.guard.failedCount,5);
});

test('expired failure window resets without inheriting an old lock',async()=>{
 const f=fixture({guard:{failedCount:5,windowStartedAt:new Date(Date.now()-20*60000),lockedUntil:new Date(Date.now()-60000)}});
 assert.equal((await verifyShiftCloseCredential(f.tx,user,session,{closeCredentialMethod:'PIN',pin:'1357'})).status,401);assert.equal(f.state.guard.failedCount,1);assert.equal(f.state.guard.lockedUntil,null);
});

test('foreign opener company store employee and terminal fail before guard writes',async()=>{
 for(const changed of [{openedBy:'other'},{companyId:'foreign'},{storeId:'foreign'},{terminalPos:'POS-2'}]){const f=fixture();await assert.rejects(verifyShiftCloseCredential(f.tx,user,{...session,...changed},{closeCredentialMethod:'PIN',pin}),{status:403});assert.equal(f.calls.length,0)}
 const f=fixture();await assert.rejects(verifyShiftCloseCredential(f.tx,{...user,employeeId:null},session,{closeCredentialMethod:'PIN',pin}),{status:403});assert.equal(f.calls.length,0);
});

test('unavailable revoked or inactive credentials cannot authenticate or create a guard',async()=>{
 for(const credentials of [[],[{pinHash:null}]]){const f=fixture({credentials});await assert.rejects(verifyShiftCloseCredential(f.tx,user,session,{closeCredentialMethod:'PIN',pin}),{status:403});assert.equal(f.state.guard,null);assert.equal(f.calls.some(call=>call.sql.startsWith('INSERT')),false)}
});

test('ambiguous or malformed credentials refuse rather than fall back to another method',async()=>{
 for(const credentials of [{closeCredentialMethod:'PIN',pin,cardCode:'FIXTURE-CARD'},{pin},{closeCredentialMethod:'PIN',pin:'12'},{closeCredentialMethod:'PIN',pin:'12x4'},{closeCredentialMethod:'OTHER',pin}]){const f=fixture();await assert.rejects(verifyShiftCloseCredential(f.tx,user,session,credentials),{status:400});assert.equal(f.calls.length,0)}
});

test('legacy card and privileged BackOffice paths remain separate from the PIN guard',async()=>{
 const f=fixture({guard:{failedCount:5,windowStartedAt:new Date(),lockedUntil:new Date(Date.now()+60000)}});
 assert.deepEqual(await verifyShiftCloseCredential(f.tx,user,session,{cardCode:'FIXTURE-CARD'}),{ok:true,method:'CARD'});assert.equal(f.state.guard.failedCount,5);
 assert.deepEqual(await verifyShiftCloseCredential({$queryRaw(){throw Error('unexpected query')}},{tokenType:'OWNER'},session),{ok:true,method:'BACKOFFICE'});
});

test('actual close request schema requires an explicit PIN method and rejects mixed credentials before a transaction',async()=>{
 const source=await readFile(new URL('../src/routes/cash-control.js',import.meta.url),'utf8'),definition=source.slice(source.indexOf('const amount='),source.indexOf('const reportDateSchema=')),schema=new Function('z','declaredEftpos',definition+'return closeSchema;')(z,declaredEftpos),counts={eftposTotal:0};
 assert.equal(schema.safeParse({...counts,closeCredentialMethod:'PIN',pin}).success,true);assert.equal(schema.safeParse({...counts,cardCode:'FIXTURE-CARD'}).success,true);
 for(const credentials of [{pin},{closeCredentialMethod:'PIN'},{closeCredentialMethod:'PIN',pin,cardCode:'FIXTURE-CARD'},{closeCredentialMethod:'CARD',pin},{closeCredentialMethod:'PIN',pin:'12x4'}])assert.equal(schema.safeParse({...counts,...credentials}).success,false);
 assert.equal(schema.safeParse({closeCredentialMethod:'PIN',pin}).success,false,'PIN never bypasses deliberate EFTPOS declaration');
});
