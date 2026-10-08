import {appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const shaPattern=/^[a-f0-9]{40}$/;
export function productionPath(path){
  return !/^(docs\/|CHECKPOINTS\/|output\/|\.github\/|ops\/backup\/|tools\/windows-kat-setup-exe\/)/.test(path)&&!path.endsWith('.md');
}

export async function requireSuccessfulCI({repository,revision,runId,token,fetchImpl=fetch}){
  if(!shaPattern.test(revision)||!/^[-\w.]+\/[-\w.]+$/.test(repository)||!token)throw new Error('Invalid CI verification inputs');
  const api=async path=>{
    let response;
    try{response=await fetchImpl(`https://api.github.com/repos/${repository}/${path}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});}
    catch{throw new Error('GitHub CI verification request failed');}
    if(!response.ok)throw new Error(`GitHub CI verification failed: HTTP ${response.status}`);
    return response.json();
  };
  const eligible=run=>run?.name==='MyWorkStation CI'&&run.head_sha===revision&&run.head_branch==='main'&&['push','workflow_dispatch'].includes(run.event)&&run.status==='completed'&&run.conclusion==='success'&&run.head_repository?.full_name===repository;
  let runs;
  if(runId){
    if(!/^\d+$/.test(String(runId)))throw new Error('Invalid CI run ID');
    runs=[await api(`actions/runs/${runId}`)];
  }else{
    runs=(await api(`actions/workflows/ci.yml/runs?head_sha=${revision}&branch=main&status=success&per_page=100`)).workflow_runs||[];
  }
  for(const run of runs.filter(eligible)){
    for(let page=1;page<=10;page++){
      const {jobs=[]}=await api(`actions/runs/${run.id}/jobs?filter=latest&per_page=100&page=${page}`);
      const build=jobs.find(job=>job.name==='build-and-test');
      if(build){
        if(build.status==='completed'&&build.conclusion==='success')return run.id;
        break;
      }
      if(jobs.length<100)break;
    }
  }
  throw new Error('Exact main revision has no successful full CI build-and-test job');
}

export function deploymentDecision({revision,healthyRevision,latestRevision,git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim()}){
  if(![revision,healthyRevision,latestRevision].every(sha=>shaPattern.test(sha)))throw new Error('Invalid deployment revision');
  const ancestor=(a,b)=>{try{git('merge-base','--is-ancestor',a,b);return true;}catch(error){if(error.status===1)return false;throw error;}};
  if(!ancestor(revision,latestRevision))throw new Error('Requested revision is no longer on main');
  if(revision===healthyRevision||ancestor(revision,healthyRevision))return {deploy:false,reason:'Revision is already healthy or superseded'};
  if(!ancestor(healthyRevision,revision))throw new Error('Healthy revision is outside requested main history; inspect rollback state');
  if(revision!==latestRevision&&git('diff','--name-only',revision,latestRevision).split('\n').filter(Boolean).some(productionPath))return {deploy:false,reason:'A newer production source revision is on main; await its full CI'};
  return {deploy:true,reason:'Exact successful main revision needs deployment'};
}

export async function triggerPinnedDeployment({hook,revision,fetchImpl=fetch}){
  if(!shaPattern.test(revision))throw new Error('Invalid hook revision');
  let url;
  try{
    url=new URL(hook);
    if(url.protocol!=='https:'||url.hostname!=='api.render.com'||!/^\/deploy\/srv-[a-z0-9]+$/.test(url.pathname)||!url.searchParams.get('key')||url.username||url.password)throw new Error();
    url.searchParams.set('ref',revision);
  }catch{throw new Error('Invalid Render deployment hook configuration');}
  let response;
  // A timeout or ambiguous response must not automatically submit a second POST.
  try{response=await fetchImpl(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000)});}
  catch{throw new Error('Render hook outcome is uncertain; inspect deploy history before retrying');}
  if(!response.ok)throw new Error(`Render hook failed: HTTP ${response.status}; inspect deploy history before retrying`);
  // Never log the secret hook URL or its response body.
}

async function main(){
  const revision=process.env.EXPECTED_REVISION;
  if(process.argv[2]==='trigger'){
    await triggerPinnedDeployment({hook:process.env.RENDER_DEPLOY_HOOK_URL,revision});
    console.log(`Pinned Render deployment requested for ${revision}`);
    return;
  }
  await requireSuccessfulCI({repository:process.env.GITHUB_REPOSITORY,revision,runId:process.env.CI_RUN_ID,token:process.env.GH_TOKEN});
  execFileSync('git',['fetch','origin','main'],{stdio:'pipe'});
  const response=await fetch('https://myworkstation-app.onrender.com/api/health',{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Pre-deploy health failed: HTTP ${response.status}`);
  const health=await response.json();
  if(health.ok!==true)throw new Error('Pre-deploy service is unhealthy');
  const decision=deploymentDecision({revision,healthyRevision:health.revision,latestRevision:execFileSync('git',['rev-parse','origin/main'],{encoding:'utf8'}).trim()});
  appendFileSync(process.env.GITHUB_OUTPUT,`deploy=${decision.deploy}\n`);
  console.log(decision.reason);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
