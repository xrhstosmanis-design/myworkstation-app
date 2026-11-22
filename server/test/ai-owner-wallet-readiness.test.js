import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerWalletReadiness,requireOwnerWalletReady,walletServiceConfiguration} from '../src/services/ai-owner-wallet-readiness.js';

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

test('service configuration exposes only allowlisted model metadata and SMTP presence, never secrets or addresses',()=>{
  const config=walletServiceConfiguration({SMTP_HOST:'private-host',SMTP_USER:'private-user',SMTP_PASSWORD:'private-password',MAIL_FROM:'private@example.invalid',OPENAI_API_KEY:'private-openai',AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:'private-endpoint',AZURE_DOCUMENT_INTELLIGENCE_KEY:'private-azure',OPENAI_INVOICE_ASSISTANT_MODEL:'gpt-5.6-sol',OPENAI_INVOICE_MODEL:'invalid secret with spaces',AI_OWNER_WALLET_EMAIL_ENABLED:'true'});
  assert.equal(config.email.configured,true);assert.equal(config.email.enabled,true);
  assert.equal(config.invoices.azureConfigured,true);assert.equal(config.invoices.enabled,false);
  assert.equal(config.invoices.modelOverrides.find(r=>r.key==='OPENAI_INVOICE_ASSISTANT_MODEL').model,'gpt-5.6-sol');
  assert.equal(config.invoices.modelOverrides.find(r=>r.key==='OPENAI_INVOICE_MODEL').model,null);
  assert.doesNotMatch(JSON.stringify(config),/private-|example.invalid|invalid secret/);
  assert.equal(walletServiceConfiguration({}).email.configured,false);
});
