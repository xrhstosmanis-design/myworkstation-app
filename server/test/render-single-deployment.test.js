import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {deploymentDecision,requireSuccessfulCI,triggerPinnedDeployment} from '../../tools/render-deploy/guard.mjs';

const revision='a'.repeat(40),repository='xrhstosmanis-design/myworkstation-app';
const hook='https://api.render.com/deploy/srv-test123?key=private-test-key&ref=old';
const run={id:42,name:'MyWorkStation CI',head_sha:revision,head_branch:'main',event:'push',status:'completed',conclusion:'success',head_repository:{full_name:repository}};
const build={name:'build-and-test',status:'completed',conclusion:'success'};
const response=body=>({ok:true,json:async()=>body});

test('Render hook pins the full validated SHA and sends exactly one secret-preserving POST',async()=>{
  const calls=[];
  await triggerPinnedDeployment({hook,revision,fetchImpl:async(url,options)=>{calls.push({url:new URL(url),options});return {ok:true}}});
  assert.equal(calls.length,1);assert.equal(calls[0].url.searchParams.get('ref'),revision);
  assert.equal(calls[0].url.searchParams.get('key'),'private-test-key');
  assert.equal(calls[0].url.searchParams.getAll('ref').length,1);
  assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.redirect,'error');
});

test('ambiguous hook failures and HTTP errors never retry or leak secrets',async()=>{
  for(const outcome of [()=>{throw new Error(hook)},()=>({ok:false,status:503})]){
    let count=0;
    await assert.rejects(triggerPinnedDeployment({hook,revision,fetchImpl:async()=>{count++;return outcome()}}),error=>!error.message.includes('private-test-key')&&!error.message.includes('api.render.com')&&/inspect deploy history/.test(error.message));
    assert.equal(count,1);
  }
});

test('invalid revision or non-Render hook cannot cause a deployment request',async()=>{
  let count=0;const fetchImpl=async()=>{count++;return {ok:true}};
  for(const badHook of ['http://api.render.com/deploy/srv-test123?key=x','https://elsewhere.invalid/deploy/srv-test123?key=x','https://api.render.com/wrong?key=x','https://api.render.com/deploy/srv-test123','https://user:password@api.render.com/deploy/srv-test123?key=x'])await assert.rejects(triggerPinnedDeployment({hook:badHook,revision,fetchImpl}));
  await assert.rejects(triggerPinnedDeployment({hook,revision:'main',fetchImpl}));assert.equal(count,0);
});

test('only exact successful main CI with a successful full build authorizes deployment',async()=>{
  const fetchImpl=async url=>response(url.includes('/jobs?')?{jobs:[build]}:run);
  assert.equal(await requireSuccessfulCI({repository,revision,runId:42,token:'test',fetchImpl}),42);
  for(const altered of [{...run,head_sha:'b'.repeat(40)},{...run,event:'pull_request'},{...run,head_branch:'other'},{...run,conclusion:'failure'},{...run,status:'in_progress'},{...run,head_repository:{full_name:'other/repo'}},{...run,name:'Other CI'}]){
    await assert.rejects(requireSuccessfulCI({repository,revision,runId:42,token:'test',fetchImpl:async()=>response(altered)}),/no successful full CI/);
  }
  for(const conclusion of ['skipped','failure','cancelled'])await assert.rejects(requireSuccessfulCI({repository,revision,runId:42,token:'test',fetchImpl:async url=>response(url.includes('/jobs?')?{jobs:[{...build,conclusion}]}:run)}),/no successful full CI/);
});

test('manual lookup still requires full CI and follows job pagination',async()=>{
  const urls=[];
  const fetchImpl=async url=>{
    urls.push(url);
    if(url.includes('/workflows/ci.yml/runs?'))return response({workflow_runs:[{...run,event:'pull_request'},run]});
    if(url.endsWith('page=1'))return response({jobs:Array.from({length:100},(_,i)=>({name:`other-${i}`}))});
    return response({jobs:[build]});
  };
  assert.equal(await requireSuccessfulCI({repository,revision,token:'test',fetchImpl}),42);
  assert.ok(urls[0].includes(`head_sha=${revision}`));assert.equal(urls.length,3);
  await assert.rejects(requireSuccessfulCI({repository,revision,runId:'not-an-id',token:'test',fetchImpl}),/Invalid CI run/);
});

test('GitHub verification failure stops deployment without exposing its token',async()=>{
  for(const fetchImpl of [async()=>{throw new Error('private-token')},async()=>({ok:false,status:403})])await assert.rejects(requireSuccessfulCI({repository,revision,runId:42,token:'private-token',fetchImpl}),error=>/GitHub CI verification/.test(error.message)&&!error.message.includes('private-token'));
});

test('real Git history admits docs-only advancement but skips stale and already healthy revisions',()=>{
  const cwd=mkdtempSync(join(tmpdir(),'mws-deploy-guard-'));
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const commit=(file,body)=>{writeFileSync(join(cwd,file),body);git('add',file);git('commit','-m',file);return git('rev-parse','HEAD')};
  try{
    git('init');git('config','user.name','Isolated test');git('config','user.email','fixture@example.invalid');
    const healthyRevision=commit('app.js','baseline'),revision=commit('app.js','new source'),docs=commit('README.md','documentation');
    assert.equal(deploymentDecision({revision,healthyRevision,latestRevision:docs,git}).deploy,true);
    assert.equal(deploymentDecision({revision,healthyRevision:revision,latestRevision:docs,git}).deploy,false);
    assert.equal(deploymentDecision({revision,healthyRevision:docs,latestRevision:docs,git}).deploy,false);
    const latest=commit('app.js','newer source');
    assert.equal(deploymentDecision({revision,healthyRevision,latestRevision:latest,git}).deploy,false);
    assert.equal(deploymentDecision({revision:latest,healthyRevision,latestRevision:latest,git}).deploy,true);
    git('checkout','--detach',healthyRevision);const divergent=commit('other.js','side branch');
    assert.throws(()=>deploymentDecision({revision,healthyRevision:divergent,latestRevision:latest,git}),/outside requested main history/);
    assert.throws(()=>deploymentDecision({revision:divergent,healthyRevision,latestRevision:latest,git}),/no longer on main/);
  }finally{rmSync(cwd,{recursive:true,force:true})}
});
