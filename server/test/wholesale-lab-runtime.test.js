import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertLabConfiguration,assertEmptyLabDatabase,labIsolationAssertion} from '../../ops/wholesale-lab/guard.mjs';

const safe=()=>({WHOLESALE_LAB:'1',LAB_BOOT_NONCE:'a'.repeat(64),DATABASE_URL:'postgresql://whlab_runtime:synthetic@127.0.0.1:5432/wholesale_lab?schema=public&connection_limit=4&pool_timeout=10'});
test('disposable runtime refuses production/external database credentials before a connection can be opened',()=>{
  assert.equal(new URL(assertLabConfiguration(safe()).databaseUrl).pathname,'/wholesale_lab');
  for(const DATABASE_URL of ['postgresql://whlab_runtime@external.example:5432/wholesale_lab','postgresql://postgres@127.0.0.1:5432/wholesale_lab','postgresql://whlab_runtime@127.0.0.1:5432/myworkstation','postgresql://whlab_runtime@127.0.0.1:5433/wholesale_lab','postgresql://whlab_runtime@127.0.0.1:5432/wholesale_lab?schema=public&schema=other','postgresql://whlab_runtime@127.0.0.1:5432/wholesale_lab?host=production.example'])assert.throws(()=>assertLabConfiguration({...safe(),DATABASE_URL}),{code:'WHOLESALE_LAB_ISOLATION_REQUIRED'});
  for(const patch of [{WHOLESALE_LAB:'0'},{LAB_BOOT_NONCE:'missing'},{JWT_SECRET:'copied-real-secret'},{SMTP_HOST:'real.example'},{DIRECT_URL:safe().DATABASE_URL},{PGHOST:'other'}])assert.throws(()=>assertLabConfiguration({...safe(),...patch}),{code:'WHOLESALE_LAB_ISOLATION_REQUIRED'});
});
test('freshness and per-transaction boot marker both fail closed without resetting existing data',async()=>{
  let writes=0;const db={$executeRawUnsafe(){writes++;throw Error('must never reset')},$queryRaw:async()=>[{name:'wholesale_lab',tables:1}]};
  await assert.rejects(assertEmptyLabDatabase(db),{code:'WHOLESALE_LAB_ISOLATION_REQUIRED'});assert.equal(writes,0);
  const check=labIsolationAssertion(assertLabConfiguration(safe()));
  for(const rows of [[],[{name:'production',bootNonce:'a'.repeat(64)}],[{name:'wholesale_lab',bootNonce:'b'.repeat(64)}]])await assert.rejects(check({$queryRaw:async()=>rows}),{code:'WHOLESALE_LAB_ISOLATION_REQUIRED'});
  assert.equal(await check({$queryRaw:async()=>[{name:'wholesale_lab',bootNonce:'a'.repeat(64)}]}),true);
});
test('live Node transports cannot dispatch externally; loopback HTTP is still usable and redirects cannot escape',()=>{
  const guard=fileURLToPath(new URL('../../ops/wholesale-lab/guard.mjs',import.meta.url));
  const source=`
    import assert from 'node:assert/strict';import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';import dns from 'node:dns';import dgram from 'node:dgram';import {installLabOutboundFence} from ${JSON.stringify('file://'+guard)};
    const server=http.createServer((req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{location:'https://external.invalid'});res.end()}else res.end('loopback-only')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const fence=installLabOutboundFence(),blocked={code:'WHOLESALE_LAB_OUTBOUND_BLOCKED'};
    assert.throws(()=>net.connect(443,'external.invalid'),blocked);assert.throws(()=>http.request('http://external.invalid'),blocked);assert.throws(()=>https.request('https://external.invalid'),blocked);assert.throws(()=>tls.connect(443,'external.invalid'),blocked);assert.throws(()=>dns.lookup('external.invalid',()=>{}),blocked);assert.throws(()=>dgram.createSocket('udp4'),blocked);await assert.rejects(fetch('https://external.invalid'),blocked);
    const url='http://127.0.0.1:'+server.address().port;assert.equal(await (await fetch(url)).text(),'loopback-only');await assert.rejects(fetch(url+'/redirect'));assert.ok(fence.blocked>=7);fence.restore();server.closeAllConnections();await new Promise(r=>server.close(r));
  `;
  const child=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:15000});
  assert.equal(child.status,0,child.stderr||child.error?.message);
});
