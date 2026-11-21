// A closed provider layout, not a general invoice/OCR parser. Only the printed
// PIECE basis is bound to detailed XML; rounded DIS/carton quantities are never
// used to invent a packaging conversion. No I/O, schema or business writes.
export const ALFA19_PROFILE = 'EPSILON19_DETAILED_LINE_AMOUNTS_V1';
const HEADERS = ['ΚΩΔΙΚΟΣ','ΠΕΡΙΓΡΑΦΗ','Μ.Μ','ΠΟΣΟΤ.','ΚΥΤΙΟ','Μ.Μ','ΠΟΣΟΤ.','ΤΕΜ.','ΤΙΜΗ','ΜΟΝΑΔΑΣ','ΑΞΙΑ(ΠΡΟ','ΕΚΠΤΩΣΗΣ)','ΕΚΠΤΩΣΗ 1','%','ΠΟΣΟ','ΕΚΠΤΩΣΗ 2','%','ΠΟΣΟ','ΕΚΠΤΩΣΗ 3','%','ΠΟΣΟ','ΕΠΙΒΑΡ','ΑΞΙΑ ΜΕΤΑ','ΤΗΝ','ΕΚΠΤ.','ΦΠΑ','ΦΟΡΟΥ','%'];
const TAX_HEADER = ['ΚΑΘΑΡΗ ΑΞΙΑ','% ΦΠΑ','ΑΞΙΑ','ΦΠΑ'];
const FOOTER = ['Α Ξ Ι Α','ΕΠΙΒΑΡΥΝΣΕΙΣ','ΦΟΡΟΛ. ΑΞΙΑ','ΕΚΔΟΤΗΣ','ΠΑΡΑΛΗΠΤΗΣ','ΦΠΑ','ΣΥΝΟΛΟ','ΛΗΦΘ.ΕΓΓΥΗΣΗ','ΓΕΝ.ΣΥΝΟΛΟ','ΤΕΛΙΚΗ ΑΞΙΑ'];
const CODE = /^DL\d{7}$/;
const POW = n => 10n ** BigInt(n);
const round = (n,d) => (n + d/2n)/d;
function fixed(n, scale) {
  const s=n.toString().padStart(scale+1,'0');
  return scale?`${s.slice(0,-scale)}.${s.slice(-scale)}`:s;
}
function decimal(value, scale, printed=false) {
  if(typeof value!=='string'&&typeof value!=='number')throw new Error('decimal');
  let s=String(value);
  if(printed){
    if(!/^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2,6}$/.test(s))throw new Error('printed decimal');
    s=s.replace(/\./g,'').replace(',','.');
  }
  if(!/^\d{1,9}(?:\.\d{1,8})?$/.test(s))throw new Error('decimal');
  const [whole,fraction='']=s.split('.');
  if(fraction.length>scale&&/[1-9]/.test(fraction.slice(scale)))throw new Error('precision');
  return BigInt(whole)*POW(scale)+BigInt(fraction.slice(0,scale).padEnd(scale,'0')||'0');
}
const money = value => decimal(value,2,true);
const sequenceAt = (tokens,index,sequence) => sequence.every((value,n)=>tokens[index+n]===value);
const occurrences = (tokens,sequence) => tokens.flatMap((_,i)=>sequenceAt(tokens,i,sequence)?[i]:[]);
const integer = value => {
  if(typeof value!=='string'||!/^\d{1,9}$/.test(value))throw new Error('integer');
  return BigInt(value);
};

export function parseAlfa19PrintedLineEconomics(input) {
  try{return parse(input)}catch{return null}
}
function parse(input) {
  const {text,xmlLines,totalNet,totalVat,totalGross,pageCount,profile}=input||{};
  if(profile!==ALFA19_PROFILE||pageCount!==2||typeof text!=='string'||text.length<200||text.length>200000
    ||!Array.isArray(xmlLines)||!xmlLines.length||xmlLines.length>250)return null;
  const tokens=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const headers=occurrences(tokens,HEADERS),carry=occurrences(tokens,['ΣΕ ΜΕΤΑΦΟΡΑ',':']),carried=occurrences(tokens,['ΑΠΟ','ΜΕΤΑΦΟΡΑ :','.']);
  if(headers.length!==2||carry.length!==1||carried.length!==1||carry[0]<=headers[0]+HEADERS.length||carry[0]>=headers[1]
    ||carried[0]<=headers[1]+HEADERS.length)return null;
  const bodyEnd=carry[0]-1;
  const first=tokens.findIndex((_,i)=>i>=headers[0]+HEADERS.length&&i<bodyEnd&&sequenceAt(tokens,i,['0,00','0,00','0,00']));
  if(first<0)return null;
  const allCodes=tokens.flatMap((v,i)=>CODE.test(v)?[i]:[]);
  if(allCodes.length!==xmlLines.length||allCodes.some(i=>i<first||i>=bodyEnd))return null;
  const byCode=new Map();
  for(const [index,line]of xmlLines.entries()){
    if(!line||!CODE.test(line.itemCode||'')||byCode.has(line.itemCode)||line.lineNumber!==index+1||line.measurementUnit!==1||line.vatCategory!==2
      ||typeof line.description!=='string'||!line.description.trim()||line.description.length>250)return null;
    byCode.set(line.itemCode,line);
  }
  const physical=[],seen=new Set();let cursor=first;
  let sumInitial=0n,sumDiscount=0n,sumNet=0n,sumVat=0n,sumQuantity=0n;
  while(cursor<bodyEnd){
    if(physical.length>=xmlLines.length||!sequenceAt(tokens,cursor,['0,00','0,00','0,00']))return null;
    const withThird=CODE.test(tokens[cursor+8]||'');
    const codeIndex=cursor+(withThird?8:7),code=tokens[codeIndex];
    if(!CODE.test(code||'')||seen.has(code)||tokens[cursor+(withThird?6:5)]!=='13')return null;
    seen.add(code);
    const amounts=[money(tokens[cursor+3]),money(tokens[cursor+(withThird?7:6)]),withThird?money(tokens[cursor+4]):null];
    const net=money(tokens[cursor+(withThird?5:4)]);
    const firstUnit=tokens[codeIndex+1],unitToken=tokens[codeIndex+2],initial=money(tokens[codeIndex+3]);
    const firstQuantity=decimal(tokens[codeIndex+4],2,true),quantity=integer(tokens[codeIndex+5]);
    if(!['ΤΕΜ','DIS'].includes(firstUnit)||!/^\d{1,9},\d{4}$/.test(unitToken||'')||firstQuantity<=0n||quantity<=0n||tokens[codeIndex+6]!=='ΤΕΜ')return null;
    const price=decimal(unitToken,6,true),q6=quantity*POW(6),base=q6*price;
    if(price<=0n||round(base,POW(10))!==initial)return null;
    if(firstUnit==='ΤΕΜ'&&firstQuantity!==quantity*100n)return null;
    // An absent third amount is omitted from provenance, not manufactured as a
    // printed zero. Its storage slot is still the neutral zero percentage.
    let remaining=initial,projected=base,denominator=POW(10),discountTotal=0n;
    const percents=[],typed=[];
    for(const [slot,amount]of amounts.entries()){
      let percent=0n;
      if(amount!==null){
        if(amount>remaining)return null;
        if(remaining===0n&&amount!==0n)return null;
        percent=remaining?round(amount*POW(10),remaining):0n;
        if(percent>POW(10))return null;
        remaining-=amount;discountTotal+=amount;
        typed.push({kind:'LINE_AMOUNT',amount:fixed(amount,2),slot:slot+1});
      }
      percents.push(fixed(percent,8));projected*=POW(10)-percent;denominator*=POW(10);
    }
    if(remaining!==net||round(projected,denominator)!==net)return null;
    const xml=byCode.get(code);
    if(!xml||decimal(xml.quantity,6)!==q6||decimal(xml.netValue,2)!==net)return null;
    const vat=decimal(xml.vatAmount,2),taxNumerator=net*13n;
    // The original prints group VAT, not line VAT. XML cent allocation is
    // authoritative only within exact floor/ceil and the complete group below.
    if(vat!==taxNumerator/100n&&vat!==(taxNumerator+99n)/100n)return null;
    let next=codeIndex+7;
    while(next<bodyEnd&&!sequenceAt(tokens,next,['0,00','0,00','0,00']))next++;
    const description=tokens.slice(codeIndex+7,next);
    if(!description.length||description.length>20||description.join(' ').length>250
      ||description.some(v=>CODE.test(v)||/^\d+(?:[.,]\d+)$/.test(v)))return null;
    physical.push({lineNumber:xml.lineNumber,physicalLineNumber:physical.length+1,itemCode:code,quantity:fixed(q6,6),
      unitCost:fixed(price,6),initialUnitCost:fixed(price,6),discount1:percents[0],discount2:percents[1],discount3:percents[2],
      printedInitialAmount:fixed(initial,2),printedDiscountSteps:typed,netValue:fixed(net,2),vatRate:13,vatAmount:fixed(vat,2)});
    sumInitial+=initial;sumDiscount+=discountTotal;sumNet+=net;sumVat+=vat;sumQuantity+=quantity;cursor=next;
  }
  if(physical.length!==xmlLines.length||money(tokens[bodyEnd])!==sumNet)return null;
  if(!footerMatches(tokens,headers[1],carried[0],{sumInitial,sumDiscount,sumNet,sumVat,sumQuantity}))return null;
  if(decimal(totalNet,2)!==sumNet||decimal(totalVat,2)!==sumVat||decimal(totalGross,2)!==sumNet+sumVat||round(sumNet*13n,100n)!==sumVat)return null;
  const byPhysicalCode=new Map(physical.map(row=>[row.itemCode,row]));
  return {version:'PRINTED_LINE_ECONOMICS_V1',profile:ALFA19_PROFILE,rows:xmlLines.map(line=>byPhysicalCode.get(line.itemCode)),
    totals:{initial:fixed(sumInitial,2),discount:fixed(sumDiscount,2),net:fixed(sumNet,2),vat:fixed(sumVat,2),gross:fixed(sumNet+sumVat,2)}};
}
function footerMatches(tokens,secondHeader,carried,{sumInitial,sumDiscount,sumNet,sumVat,sumQuantity}){
  if(money(tokens[carried-1])!==sumNet)return false;
  const at=carried+3;
  if(integer(tokens[at])!==sumQuantity||money(tokens[at+1]?.replace(/`$/,''))!==sumNet||!tokens[at+1]?.endsWith('`')||tokens[at+2]!=='`')return false;
  money(tokens[at+3]);money(tokens[at+4]);
  if(!sequenceAt(tokens,at+5,['ΣΥΝ.ΠΟΣΟΤΗΤΑ:','ΠΡΟΗΓ.ΥΠΟΛΟΙΠΟ:','ΝΕΟ ΥΠΟΛΟΙΠΟ:',...TAX_HEADER]))return false;
  if(occurrences(tokens,TAX_HEADER).length!==1||occurrences(tokens,['ΑΝΑΛΥΣΗ Φ.Π.Α.']).length!==1)return false;
  const totals=occurrences(tokens,['ΕΚΠΤΩΣΕΙΣ']);
  if(totals.length!==1||totals[0]<at+12)return false;
  const f=totals[0];
  if(!sequenceAt(tokens,f-4,['13,00`',fixed(sumVat,2).replace('.',',')+'`','0,00`','0,00`']))return false;
  const expected=[sumInitial,sumNet,sumVat,sumNet+sumVat,sumNet+sumVat,sumDiscount];
  if(expected.some((v,i)=>money(tokens[f+1+i])!==v)||!sequenceAt(tokens,f+7,FOOTER)||money(tokens[f+7+FOOTER.length])!==sumNet+sumVat)return false;
  if(occurrences(tokens,['ΤΕΛΙΚΗ ΑΞΙΑ']).length!==1)return false;
  // This proven two-page variant has all products before the first carry and
  // only an empty repeated table plus carry/footer on the second page.
  if(tokens.slice(secondHeader+HEADERS.length,carried-1).some(v=>CODE.test(v)||v==='0,00'))return false;
  return true;
}
