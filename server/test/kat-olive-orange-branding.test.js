import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../../client/public/kat/app.html',import.meta.url),'utf8');
const scope=html.match(/<script id="kat-branding-scope">([\s\S]*?)<\/script>/)[1];
test('KAT palette activates only on the exact KAT public routes',()=>{
 for(const pathname of ['/online/kat','/online/kat/','/kat','/kat/','/kat/app.html','/kat/index.html']){
  const classes=[];vm.runInNewContext(scope,{location:{pathname},document:{documentElement:{classList:{add:v=>classes.push(v)}}}});assert.deepEqual(classes,['kat-olive-orange'],pathname);
 }
 for(const pathname of ['/online/daily-bite','/online/kat-other','/online/KAT','/platform-admin','/store/kat-store','/kat/unknown']){
  const classes=[];vm.runInNewContext(scope,{location:{pathname},document:{documentElement:{classList:{add:v=>classes.push(v)}}}});assert.deepEqual(classes,[],pathname);
 }
});
test('KAT logo is a bundled image, independent of external hosts',async()=>{
 const svg=await readFile(new URL('../../client/public/kat/brand-kat.svg',import.meta.url),'utf8');
 const logo=Buffer.from(svg.match(/base64,([^"]+)/)[1],'base64');
 assert.equal(logo.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.match(html,/url\('\/kat\/brand-kat\.svg'\) center\/contain no-repeat/);
});
