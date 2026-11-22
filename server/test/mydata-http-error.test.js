import test from 'node:test';
import assert from 'node:assert/strict';
import {inspect} from 'node:util';
import {myDataHttpError} from '../src/mydata-http-error.js';

const key='private-subscription-secret-123',user='private-api-user-456';
const make=(status,body,environment='PRODUCTION')=>myDataHttpError({status,body,environment});
test('known key refusal gets fixed guidance, safe correlation and no raw body or credentials',()=>{
  for(const body of [JSON.stringify({message:`Access denied due to invalid subscription key. ${key} ${user}`}),`<Response><error><message>Access denied due to invalid subscription key. ${key}</message></error></Response>`,'Access denied due to invalid subscription key.']){
    const error=make(403,body);
    assert.equal(error.status,502);assert.equal(error.code,'MYDATA_HTTP_ERROR');
    assert.equal(error.diagnostic.reason,'INVALID_SUBSCRIPTION_KEY');assert.match(error.message,/μη έγκυρο subscription key/);
    assert.match(error.diagnostic.reference,/^[0-9a-f-]{36}$/);assert.ok(error.message.includes(error.diagnostic.reference));
    assert.equal(Object.isFrozen(error.diagnostic),true);
    for(const sensitive of [key,user,'<Response>'])assert.equal(inspect(error).includes(sensitive),false);
    assert.deepEqual(Object.keys(error.diagnostic).sort(),['reference','operation','upstreamStatus','environment','reason'].sort());
  }
});
test('unknown403 is not diagnosed as bad credentials, and every failure gets a new reference',()=>{
  const a=make(403,JSON.stringify({message:`Forbidden ${key} ${user}`}));
  const b=make(403,'');assert.equal(a.diagnostic.reason,'ACCESS_DENIED');
  assert.match(a.message,/δεν επιβεβαιώνει λανθασμένους κωδικούς/);assert.notEqual(a.diagnostic.reference,b.diagnostic.reference);
  assert.equal(inspect(a).includes(key),false);
  assert.equal(make(403,`<html>Access denied due to invalid subscription key. ${key}</html>`).diagnostic.reason,'ACCESS_DENIED');
  for(const body of ['{not-json',JSON.stringify({message:{secret:key}}),'x'.repeat(8193),null])assert.equal(make(403,body).diagnostic.reason,'ACCESS_DENIED');
});
test('authentication, missing key, limit and upstream availability remain distinct',()=>{
  assert.equal(make(401,'').diagnostic.reason,'AUTHENTICATION_REJECTED');
  assert.equal(make(401,'Access denied due to missing subscription key.').diagnostic.reason,'MISSING_SUBSCRIPTION_KEY');
  assert.equal(make(429,key).diagnostic.reason,'RATE_LIMITED');
  assert.equal(make(503,key).diagnostic.reason,'UPSTREAM_UNAVAILABLE');
  assert.equal(make(404,key).diagnostic.reason,'HTTP_ERROR');
  const error=make(403,'','SANDBOX');assert.equal(error.diagnostic.environment,'SANDBOX');assert.match(error.message,/Δοκιμές/);
  assert.doesNotMatch(error.message,/Δεν αποθηκεύτηκε παραστατικό/); // earlier successful pages may exist
});
