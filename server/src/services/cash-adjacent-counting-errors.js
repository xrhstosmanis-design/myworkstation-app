// Read-only consecutive cash counting candidates. Never alter money, reviews or financial finality.
// The canonical report supplies only already-authorized, same-snapshot scoped sources.
const integer=value=>Number.isSafeInteger(value);
const signedResidual=(v,matched)=>{const remaining=Math.abs(v)-matched;return remaining===0?0:Math.sign(v)*remaining;};
const compare=(a,b)=>new Date(a.previousClosedAt)-new Date(b.previousClosedAt)||a.previousSessionId.localeCompare(b.previousSessionId);
export function projectAdjacentCashCountingCandidates({source,rows,immediatePair,cashCurrent,exactCents,localDay}){
  if(!(source?.sessions instanceof Map)||!(rows instanceof Map)||typeof immediatePair!=='function'||typeof cashCurrent!=='function'||typeof exactCents!=='function'||typeof localDay!=='function')throw new TypeError('Invalid adjacent cash report inputs');
  const selected=new Set(source.selectedIds);
  const proposed=[];
  for(const previous of source.sessions.values()){
    const next=source.sessions.get(previous?.session?.nextSession?.id);
    if(!next||!selected.has(previous.session.id)&&!selected.has(next.session.id)||!immediatePair(previous,next,source.rule))continue;
    if(next.session.previousSession?.id&&next.session.previousSession.id!==previous.session.id)continue;
    const a=rows.get(previous.session.id),b=rows.get(next.session.id);
    if(!a||!b||a.recheck||b.recheck||a.reviewed||b.reviewed||!cashCurrent(a)||!cashCurrent(b))continue;
    if(a.offsetCents!==0||b.offsetCents!==0||a.offsets?.length||b.offsets?.length)continue;
    const x=a.remainingCents,y=b.remainingCents;
    if(!integer(x)||!integer(y)||x===0||y===0||Math.sign(x)===Math.sign(y))continue;
    const closing=exactCents(previous.session.actualOperational),opening=exactCents(next.session.openingOperational);
    if(!integer(closing)||!integer(opening)||closing!==opening)continue;
    const overlap=Math.min(Math.abs(x),Math.abs(y));
    if(!integer(overlap)||overlap<=0)continue;
    proposed.push({
      previousSessionId:a.sessionId,nextSessionId:b.sessionId,
      previousSourceHash:a.sourceHash,nextSourceHash:b.sourceHash,
      terminalPos:previous.session.terminalPos,
      previousClosedAt:new Date(previous.session.closedAt).toISOString(),
      nextClosedAt:new Date(next.session.closedAt).toISOString(),
      previousDay:localDay(previous.session.closedAt),nextDay:localDay(next.session.closedAt),
      previousOperatorName:a.operatorName,nextOperatorName:b.operatorName,
      previousDifferenceCents:x,nextDifferenceCents:y,
      commonCents:overlap,previousResidualCents:signedResidual(x,overlap),nextResidualCents:signedResidual(y,overlap),
      status:'COUNTING_ERROR_CANDIDATE'
    });
  }
  const frequency=new Map();
  for(const pair of proposed)for(const id of [pair.previousSessionId,pair.nextSessionId])frequency.set(id,(frequency.get(id)||0)+1);
  return proposed.map(pair=>frequency.get(pair.previousSessionId)>1||frequency.get(pair.nextSessionId)>1
    ? {...pair,status:'AMBIGUOUS_OVERLAP',commonCents:null,previousResidualCents:null,nextResidualCents:null}
    : pair).sort(compare);
}
export function adjacentCashCountingText(pairs){
  const money=n=>(Math.abs(n)/100).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
  if(!Array.isArray(pairs)||pairs.length===0)return [];
  const lines=['','ΕΝΔΕΙΞΕΙΣ ΛΑΘΟΥΣ ΚΑΤΑΜΕΤΡΗΣΗΣ — ΔΙΑΔΟΧΙΚΕΣ ΒΑΡΔΙΕΣ'];
  for(const p of pairs){
    const label=`${p.previousDay} · ${p.previousOperatorName} → ${p.nextDay} · ${p.nextOperatorName} (${p.terminalPos})`;
    const signs=`${p.previousDifferenceCents<0?'-':'+'}${money(p.previousDifferenceCents)} / ${p.nextDifferenceCents<0?'-':'+'}${money(p.nextDifferenceCents)}`;
    if(p.status==='AMBIGUOUS_OVERLAP'){lines.push(`ΑΜΦΙΒΟΛΗ ΑΛΛΗΛΟΥΧΙΑ: ${label}, ${signs}. Η ίδια βάρδια συμμετέχει σε περισσότερα από ένα ζεύγη· απαιτείται ανθρώπινη διασταύρωση, χωρίς κατανομή ποσού.`);continue;}
    lines.push(`ΠΡΟΤΕΙΝΟΜΕΝΟ ΛΑΘΟΣ ΚΑΤΑΜΕΤΡΗΣΗΣ: ${label}, διαφορές ${signs}, κοινό ποσό ${money(p.commonCents)}, υπόλοιπο προηγούμενης ${p.previousResidualCents<0?'-':'+'}${money(p.previousResidualCents)}, επόμενης ${p.nextResidualCents<0?'-':'+'}${money(p.nextResidualCents)}. Προς τεκμηρίωση — όχι οριστικός συμψηφισμός.`);
  }
  lines.push('Οι προτάσεις δεν αλλάζουν τα ποσά των βαρδιών, τις κάρτες, τις οικονομικές εγγραφές ή την έγκριση. Τα αποδεικτικά και τα υπόλοιπα ελέγχονται χωριστά.');
  return lines;
}
