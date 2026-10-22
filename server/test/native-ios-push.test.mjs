import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativePayload,nativePlatform,nativeIosConfigured} from '../src/native-fcm-provider.mjs';
const input={token:'fixture_token_1234567890',binding:'a'.repeat(64),storeId:'store-1',companyId:'company-1',storeName:'LAB\n\u202e ONE'};
test('iOS is explicitly gated independently of existing Android FCM',()=>{
 const env={NATIVE_CHAT_FCM_ENABLED:'true',NATIVE_CHAT_FCM_SERVICE_ACCOUNT_JSON:'fixture-not-read'};
 assert.equal(nativeIosConfigured(env),false);assert.equal(nativeIosConfigured({...env,NATIVE_CHAT_IOS_ENABLED:'true'}),true);assert.equal(nativeIosConfigured({...env,NATIVE_CHAT_IOS_ENABLED:'true',NATIVE_CHAT_FCM_ENABLED:'false'}),false);
});
test('old Android registration and payload remain exactly compatible',()=>{
 assert.equal(nativePlatform(undefined),'android');assert.equal(nativePlatform('ios'),'ios');
 const p=nativePayload(input);assert.deepEqual(p.message.android,{priority:'high',ttl:'300s',collapse_key:'mws-chat'});assert.equal(p.message.apns,undefined);assert.deepEqual(nativePayload({...input,platform:'android'}),p);
 for(const v of [null,'IOS','web','',{},[],1])assert.throws(()=>nativePlatform(v),{status:400});
});
test('iOS APNs alert has only generic message and bounded sanitized store; session binding stays in data',()=>{
 const p=nativePayload({...input,platform:'ios',now:1000000}).message;
 assert.equal(p.android,undefined);assert.equal(p.apns.headers['apns-expiration'],'1300');assert.equal(p.apns.headers['apns-push-type'],'alert');assert.equal(p.apns.headers['apns-collapse-id'],'mws-chat');
 assert.deepEqual(p.apns.payload.aps.alert,{title:'MyWorkStation Chat · LAB ONE',body:'Υπάρχει νέο μήνυμα.'});assert.equal(p.data.binding,input.binding);assert.equal(p.data.storeId,'store-1');assert.equal(p.data.companyId,'company-1');
 const serial=JSON.stringify(p);assert(!serial.includes('sender'));assert(!serial.includes('attachment'));assert(!serial.includes('question'));assert.throws(()=>nativePayload({...input,platform:'ios',now:NaN}));
});
test('iOS registration/persistence/delivery retains existing current-session authorization and no new schema',()=>{
 const src=readFileSync(new URL('../src/native-chat-push.mjs',import.meta.url),'utf8');
 assert.match(src,/target==='ios'&&!nativeIosConfigured\(\)/);assert.match(src,/const identity=\{platform:target/);assert.match(src,/platform==='ios'&&!nativeIosConfigured\(\)\)continue/);assert.match(src,/if\(!await nativeRecipientAllowed\(row,store/);assert.match(src,/\$2 AND "sessionId"=\$3/);
});
