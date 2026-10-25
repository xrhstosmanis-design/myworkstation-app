import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aiWalletRecoveryColumns,assertAiWalletCatalogue} from '../src/services/ai-owner-wallet-schema.js';
import {reviewedFreshStoreManifest} from '../src/services/store-lifecycle-manifest.js';
import {createLifecycleExecutionCore} from '../src/services/store-lifecycle-executor.js';
import {FRESH_STORE_KEEP,RESET_KEEP} from '../src/services/store-lifecycle-policy.js';
test('only wallet usage attribution is store scoped and retained; company money/credit/notice/audit never become store-owned',()=>{
 const m=reviewedFreshStoreManifest(),columns=aiWalletRecoveryColumns();
 assert.doesNotThrow(()=>assertAiWalletCatalogue(m));
 for(const [name,c] of Object.entries(columns))assert.deepEqual(m.knownColumns[name],c);
 assert.deepEqual(m.tables.find(t=>t.name==='AiOwnerWalletEntry'),{name:'AiOwnerWalletEntry',owner:{kind:'DIRECT'},reset:'KEEP'});
 assert.ok(FRESH_STORE_KEEP.has('AiOwnerWalletEntry'));assert.ok(RESET_KEEP.has('AiOwnerWalletEntry'));
 assert.doesNotThrow(()=>createLifecycleExecutionCore(m,{sourceRevision:'1'.repeat(40),persistAndVerifyRecovery:async()=>assert.fail('pure catalogue must not execute recovery')}));
 for(const mutate of [m=>m.tables.find(t=>t.name==='AiOwnerWalletEntry').reset='REMOVE',m=>m.knownColumns.AiOwnerWalletEntry[2][2]=true,m=>m.knownTables=m.knownTables.filter(n=>n!=='AiOwnerWalletAudit'),m=>m.tables.push({name:'AiOwnerWallet',owner:{kind:'DIRECT'},reset:'KEEP'})]){
  const copy=structuredClone(m);mutate(copy);assert.throws(()=>assertAiWalletCatalogue(copy));
 }
});
test('startup preserves prior initialization and adds only empty wallet schema provisioning',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url)));
 assert.match(pkg.scripts.start,/^node server\/scripts\/ensure-assistant-history.js && node server\/scripts\/ensure-ftext-recovery-schema.js && node server\/scripts\/ensure-ai-wallet-recovery-schema.js && npm run prisma:generate/);
 const script=readFileSync(new URL('../scripts/ensure-ai-wallet-recovery-schema.js',import.meta.url),'utf8');
 assert.ok(script.includes("process.env.NODE_ENV==='production'"));assert.ok(!/grantTrial|\.credit\(|\.configure\(|process\.env\.[A-Z_]+\s*=(?!=)/.test(script));
});
