import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerWalletReadiness,requireOwnerWalletReady} from '../src/services/ai-owner-wallet-readiness.js';

const tariff={model:'synthetic-owner',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:2000000,contextTokens:20000,maxOutputTokens:8192};
const env={OPENAI_COMMAND_CENTER_MODEL:tariff.model,OPENAI_API_KEY:'synthetic-secret-never-exposed',AI_OWNER_WALLET_TARIFFS:JSON.stringify([tariff])};
test('activation readiness uses the actual runtime model, conservative tariff and current available balance without exposing secrets',()=>{
  const ready=ownerWalletReadiness(env,'5000000');assert.equal(ready.model,tariff.model);assert.equal(ready.ready,true);assert.equal(ready.maxReservationMicros,'36384');assert.equal(ready.availableEnough,true);
  assert.equal(ownerWalletReadiness(env,'36383').availableEnough,false);assert.equal(ownerWalletReadiness(env,'36384').availableEnough,true);
  assert.doesNotMatch(JSON.stringify(ready),/synthetic-secret|OPENAI_API_KEY/);assert.match(ready.tariff.version,/^[a-f0-9]{64}$/);
});
test('activation rejects absent provider, missing/ambiguous/invalid prices and output limits below existing recovery requirements',()=>{
  assert.equal(ownerWalletReadiness({}).model,'gpt-5-mini');
  for(const value of [{...env,OPENAI_API_KEY:''},{...env,AI_OWNER_WALLET_TARIFFS:''},{...env,AI_OWNER_WALLET_TARIFFS:'invalid'},{...env,OPENAI_COMMAND_CENTER_MODEL:'unpriced-model'},{...env,AI_OWNER_WALLET_TARIFFS:JSON.stringify([tariff,tariff])},{...env,AI_OWNER_WALLET_TARIFFS:JSON.stringify([{...tariff,maxOutputTokens:5000}])}]){
    assert.equal(ownerWalletReadiness(value).ready,false);assert.throws(()=>requireOwnerWalletReady(value),e=>['AI_WALLET_PROVIDER_REQUIRED','AI_WALLET_TARIFF_REQUIRED'].includes(e.code)&&e.status===503);
  }
});
