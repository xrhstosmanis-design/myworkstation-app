import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesVerifiedEpsilonOriginal as matches} from '../src/lib/mydata-original-provider-profiles.js';
import {originalDownloadUrl} from '../src/mydata-original.js';

const id='a'.repeat(32),vat='099999999';
const profiles=[
 ['epsilondigital.epsilonnet.gr','8'],['epsilondigital3.epsilonnet.gr','84'],
 ['epsilondigital14.epsilonnet.gr','160'],['epsilondigital22.epsilonnet.gr','190'],
 ['epsilondigital-enetgroup.epsilonnet.gr','107'],['epsilondigital-nbg.epsilonnet.gr','109'],
 ['epsilondigitalsmart10.epsilonnet.gr','227'],['epsilondigital19.epsilonnet.gr','177'],
 ['epsilondigital-3rdpartb.epsilonnet.gr','129'],['epsilondigital9.epsilonnet.gr','145'],
 ['epsilondigital-3rdparte.epsilonnet.gr','169'],['epsilondigital-cosmote.epsilonnet.gr','22'],['epsilondigital-telekom.epsilonnet.gr','22'],
];
for(const [host,format] of profiles)test(`verified Epsilon exact host/format ${host}:${format}`,()=>{
 assert.equal(matches(new URL(`https://${host}/fd/${id}:${format}`),vat),true);
 assert.equal(originalDownloadUrl(`<downloadingInvoiceUrl>https://${host}/fd/${id}:${format}</downloadingInvoiceUrl>`,vat),`https://${host}/fd/${id}:${format}/pdf`);
 assert.equal(matches(new URL(`https://${host}/fd/${id.toUpperCase()}:${format}/`),vat),true);
 assert.equal(matches(new URL(`https://${host}/fd/${id}:999`),vat),false);
 assert.equal(matches(new URL(`https://${host}.example/fd/${id}:${format}`),vat),false);
 assert.equal(matches(new URL(`https://${host}/fd/${id}:0${format}`),vat),false);
});
test('unverified and redirect-only Epsilon formats stay disabled',()=>{
 for(const [host,format] of [['epsilondigital-3rdpartd.epsilonnet.gr','159'],['epsilondigital23.epsilonnet.gr','201'],['epsilondigitalsmart2.epsilonnet.gr','128'],['other.epsilonnet.gr','8']]){
  assert.equal(matches(new URL(`https://${host}/fd/${id}:${format}`),vat),false);
  assert.throws(()=>originalDownloadUrl(`<downloadingInvoiceUrl>https://${host}/fd/${id}:${format}</downloadingInvoiceUrl>`,vat));
 }
});
test('issuer validation and URL security boundaries apply before a provider match',()=>{
 const base=`https://epsilondigital.epsilonnet.gr/fd/${id}:8`;
 for(const issuer of [undefined,null,'','12345678','1234567890','123 456789','12345678x',{},[]])assert.equal(matches(new URL(base),issuer),false);
 assert.equal(matches(new URL(base),123456789),true);
 // The existing Epsilon path matcher is case-insensitive; preserve that contract.
 assert.equal(matches(new URL(base.replace('/fd/','/FD/')),vat),true);
 for(const input of [null,{},base])assert.equal(matches(input,vat),false);
 for(const url of [base.replace('https:','http:'),base.replace('https://','https://user@'),base.replace('https://','https://user:secret@'),base.replace('.gr/','.gr:444/'),base+'?token=x',base+'#fragment',base+'/pdf',base.replace(id,id.slice(1)),base.replace(id,'g'.repeat(32)),base.replace('/fd/','/other/'),base.replace(':8',':8/extra')])assert.equal(matches(new URL(url),vat),false);
});
