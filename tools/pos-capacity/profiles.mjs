import {scheduleActions} from './runner.mjs';

// Never infer a sustained result from the short integration preflight.
export function priority20Phases(profile='full'){
  if(!['full','preflight'].includes(profile))throw new Error('Unknown priority20 profile');
  return [
    {name:'warmup',seconds:300,rate:'normal'},
    {name:'normal',seconds:1800,rate:'normal'},
    {name:'peak',seconds:900,rate:'peak'},
    {name:'synchronized-read-burst',seconds:1,rate:'burst'},
    {name:'endurance',seconds:7200,rate:'normal'},
  ].map(p=>({...p,stores:20,pos:22,profile,seconds:profile==='preflight'?3:p.seconds}));
}

export function priority20Events(phase,actors,owners){
  if(actors.length!==22||owners.length!==20)throw new Error('Priority20 requires all 22 POS and 20 BackOffice actors');
  const peak=phase.rate==='peak',burst=phase.rate==='burst',short=phase.profile==='preflight';
  const pos=burst?[{kind:'pos-local-search',perMinute:1},{kind:'pos-refresh',perMinute:1}]:[
    {kind:'pos-local-search',perMinute:peak?12:6},
    {kind:'pos-refresh',perMinute:peak?2:1},
    // Refresh includes one access validation. Offer two/minute in total.
    ...(!peak?[{kind:'pos-session',perMinute:1}]:[]),
    {kind:'pos-sale',perMinute:peak?3:1},
  ];
  const bo=[{kind:'backoffice-search',perMinute:peak?2:1},{kind:'backoffice-report',perMinute:peak?1:.2}];
  const seed=`priority20-${phase.name}`;
  const events=[...scheduleActions(actors,pos,phase.seconds*1000,{seed:seed+'-pos',burst:burst||short}),
    ...scheduleActions(owners,bo,phase.seconds*1000,{seed:seed+'-bo',burst:burst||short})];
  if(short&&!burst){events.sort((a,b)=>a.id.localeCompare(b.id));events.forEach((e,i)=>{e.atMs=i*20})}
  return events.sort((a,b)=>a.atMs-b.atMs||a.id.localeCompare(b.id));
}

export function assessPhase(metrics){
  const limits={'pos-local-search':[1000,2000],'backoffice-search':[1000,2000],
    'pos-sale':[1000,2000],'pos-session':[3000,5000],'pos-refresh':[3000,5000],'backoffice-report':[3000,5000]};
  const violations=[];
  for(const [kind,row] of Object.entries(metrics.byKind)){
    if(row.completed!==row.offered||row.dropped)violations.push(`${kind}:errors-or-drops`);
    if(row.lateOver1s>Math.floor(row.offered*.01))violations.push(`${kind}:dispatch-lag`);
    const [p95,p99]=limits[kind]||[0,0];
    if(row.p95Ms===null||row.p95Ms>p95||row.p99Ms>p99)violations.push(`${kind}:latency`);
  }
  if(!metrics.samples.length)violations.push('no-actions');
  return {status:violations.length?'FAIL':'PASS',violations};
}
