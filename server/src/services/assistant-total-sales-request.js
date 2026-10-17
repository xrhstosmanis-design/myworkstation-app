import {businessQuestionPeriod,isBusinessPeriodFollowup} from './assistant-business-period.js';

const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el-GR').replace(/\s+/g,' ').trim();
const clean=value=>normalize(value).replace(/[.!;?]+$/g,'').trim();
const format=/\s*σε (?:csv|excel|xlsx|pdf|word|docx)$/;
const prefix=/^(?:(?:δειξε|βγαλε|δωσε|φερε|παρουσιασε)(?: μου)?|θελω (?:να δω|να μου δειξεις)|μπορεις να μου δειξεις)\s+/;
const subject=/^(?:(?:(?:τις|οι|το) )?(?:συνολικες πωλησεις|συνολο (?:των )?πωλησεων|πωλησεις)|(?:(?:τον|ο) )?(?:συνολικο[ς]? )?τζιρο[ς]?|τι τζιρο (?:καναμε|ειχαμε|εχουμε)|ποσο (?:πουλησαμε|ειναι ο τζιρος))(?=\s|$)/;
const periodText=value=>clean(value).replace(/^του\s+/,'');
const onlyPeriod=value=>Boolean(periodText(value))&&isBusinessPeriodFollowup(periodText(value));

function totalPhrase(value,{now}){
 const q=clean(value).replace(/\s+παρακαλω$/,'').replace(format,'').replace(prefix,'');
 const match=q.match(subject);if(!match)return null;
 const rest=q.slice(match[0].length).trim();
 // Consume every qualifier. Unknown/product/payment/actor/store words must
 // stay on the filtered path, never silently become an all-product report.
 if(rest&&!onlyPeriod(rest))return null;
 return {hasPeriod:Boolean(rest),period:rest?businessQuestionPeriod(periodText(rest),{now}):null};
}

// These are the exact hints emitted by assistantEffectiveQuestion. They carry
// user wording only; they cannot grant scope or serve as report evidence.
const markers=[
 ['Προηγούμενο θέμα της ίδιας συνομιλίας: ','topic'],
 ['Περίοδος της ίδιας αναζήτησης πωλήσεων: ','period'],
 ['Η νεότερη περίοδος αυτής της αναζήτησης είναι: ','period']
];
const instructions=new Set([
 'Χρησιμοποίησε μόνο την προηγούμενη περίοδο, με το είδος/κατηγορία της νέας ερώτησης και το ήδη εξουσιοδοτημένο εύρος.',
 'Χρησιμοποίησε αυτή την περίοδο αντί οποιασδήποτε παλαιότερης.'
]);
function parts(question){
 const out={current:[],topic:[],period:[]};let target='current';
 for(const line of String(question??'').replace(/\r\n?/g,'\n').split('\n')){
  const marker=markers.find(([prefix])=>line.startsWith(prefix));
  if(marker){target=marker[1];out[target].push(line.slice(marker[0].length));}
  else if(target==='current'||!instructions.has(line))out[target].push(line);
 }
 return Object.fromEntries(Object.entries(out).map(([key,lines])=>[key,lines.join(' ').trim()]));
}

export function plainTotalSalesRequest(question,{now=new Date()}={}){
 const p=parts(question),current=totalPhrase(p.current,{now}),topic=p.topic?totalPhrase(p.topic,{now}):null;
 if(p.topic&&!topic)return null;
 let hinted=null;
 if(p.period){
  const phrase=totalPhrase(p.period,{now});
  if(!phrase&&!onlyPeriod(p.period))return null;
  hinted=phrase?.period||businessQuestionPeriod(periodText(p.period),{now});
  if(!hinted)return null;
 }
 let period=current?.period;
 if(!current){
  // A date/format fragment has meaning only after a recognized unfiltered
  // total-sales topic. A model reply or arbitrary context is never a topic.
  if(!topic)return null;
  const q=clean(p.current).replace(/\s+παρακαλω$/,''),rest=q.replace(format,'').trim();
  if(rest&&!onlyPeriod(rest))return null;
  if(!rest&&!format.test(q))return null;
  period=rest?businessQuestionPeriod(periodText(rest),{now}):hinted||topic.period;
 }else if(!period){
  // A supplied but invalid period cannot fall back to an older valid date.
  if(current.hasPeriod)return null;
  period=hinted||topic?.period;
 }
 return period?{mode:'all',names:[],...period}:null;
}
