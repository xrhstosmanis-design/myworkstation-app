import test from 'node:test';
import assert from 'node:assert/strict';
import {extraWalletEmailSchema,readExtraWalletEmails} from '../src/services/ai-wallet-extra-email.js';

test('wallet email settings normalize duplicates and reject invalid or oversized lists',()=>{
  assert.deepEqual(extraWalletEmailSchema.parse([' Owner@example.com ','owner@example.com','Accounts@example.com']),['owner@example.com','accounts@example.com']);
  for(const invalid of [['a@example.com,b@example.com'],['a@example.com\nb@example.com'],['invalid'],Array(11).fill('a@example.com')]){
    assert.equal(extraWalletEmailSchema.safeParse(invalid).success,false);
  }
});

test('existing wallets have no extras and reads are explicitly company scoped',async()=>{
  const db={$queryRaw:async(sql,company)=>company==='with-config'?[{emails:['a@example.com']}]:[]};
  assert.deepEqual(await readExtraWalletEmails(db,'legacy'),[]);
  assert.deepEqual(await readExtraWalletEmails(db,'with-config'),['a@example.com']);
});
