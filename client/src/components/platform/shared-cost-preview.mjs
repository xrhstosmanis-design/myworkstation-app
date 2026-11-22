import {walletMicrosFromEuros} from '../voice/ai-wallet-money.mjs';

const LAB_COMPANY_ID='cmtpopbgk000prhb5qc60zxus';
const reject=message=>{throw new Error(message)};
const id=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=160;
const compare=(a,b)=>a<b?-1:a>b?1:0;
export function sharedCostPeriodDays(period){
  if(typeof period!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period))reject('Επίλεξε έγκυρο μήνα από το 2000 έως το 2099.');
  const [year,month]=period.split('-').map(Number);
  return new Date(Date.UTC(year,month,0)).getUTCDate();
}
export function sharedCostStores(companies=[]){
  if(!Array.isArray(companies)||companies.length>1000)reject('Ο κατάλογος καταστημάτων δεν είναι διαθέσιμος.');
  const stores=[],seenCompanies=new Set(),seenStores=new Set();
  for(const company of companies){
    if(company?.active!==true||company.id===LAB_COMPANY_ID||company.isTest===true||company.isDemo===true)continue;
    if(!id(company.id)||seenCompanies.has(company.id))reject('Μη έγκυρη ή διπλή εταιρεία στον κατάλογο.');
    seenCompanies.add(company.id);
    for(const store of company.stores||[]){
      if(store?.active!==true||store.isTest===true||store.isDemo===true)continue;
      if(!id(store.id)||seenStores.has(store.id))reject('Μη έγκυρο ή διπλό κατάστημα στον κατάλογο.');
      seenStores.add(store.id);
      stores.push({companyId:company.id,companyName:String(company.name||company.id),storeId:store.id,storeName:String(store.name||store.id)});
      if(stores.length>1000)reject('Υπερβολικά πολλά καταστήματα για προεπισκόπηση.');
    }
  }
  return stores.sort((a,b)=>compare(a.companyId,b.companyId)||compare(a.storeId,b.storeId));
}
export function sharedCostCatalogueKey(companies){return JSON.stringify(sharedCostStores(companies));}

// Preview only: no transport, persistence, wallet access or posting identity.
// EUR supplier cost excludes prepaid funding and already recovered direct usage.
export function previewSharedCost({period,amount,reference,confirmed,participants},companies){
  const maxDays=sharedCostPeriodDays(period);
  if(typeof reference!=='string'||reference.trim().length<3||reference.trim().length>240)reject('Συμπλήρωσε πηγή τεκμηρίωσης του ποσού (3–240 χαρακτήρες).');
  if(confirmed!==true)reject('Επιβεβαίωσε τη βάση κόστους σε ευρώ και τη συμμετοχή των καταστημάτων.');
  const baseCents=BigInt(walletMicrosFromEuros(amount))/10000n;
  if(!Array.isArray(participants)||!participants.length||participants.length>1000)reject('Επίλεξε τουλάχιστον ένα κατάστημα με ημέρες εξυπηρέτησης.');
  const catalogue=new Map(sharedCostStores(companies).map(row=>[row.storeId,row])),seen=new Set();
  const rows=participants.map(participant=>{
    const store=catalogue.get(participant?.storeId);
    if(!store||seen.has(store.storeId))reject('Επίλεξε διαφορετικά ενεργά εμπορικά καταστήματα από τον κατάλογο.');
    seen.add(store.storeId);
    const text=String(participant.days??'');
    if(!/^[1-9]\d?$/.test(text)||Number(text)>maxDays)reject(`Οι ημέρες εξυπηρέτησης πρέπει να είναι από 1 έως ${maxDays}.`);
    return {...store,days:Number(text),key:store.companyId+'\0'+store.storeId};
  }).sort((a,b)=>compare(a.key,b.key));
  const totalDays=rows.reduce((n,row)=>n+row.days,0),denominator=BigInt(totalDays);
  // One inclusive agreed margin at pool level; round upwards once to cents.
  const totalCents=(baseCents*150n+99n)/100n;
  const allocated=rows.map(row=>({...row,cents:totalCents*BigInt(row.days)/denominator,remainder:totalCents*BigInt(row.days)%denominator}));
  const extra=Number(totalCents-allocated.reduce((n,row)=>n+row.cents,0n));
  const ranked=[...allocated].sort((a,b)=>a.remainder===b.remainder?compare(a.key,b.key):a.remainder>b.remainder?-1:1);
  for(let i=0;i<extra;i++)ranked[i].cents++;
  const totals=new Map();
  const stores=allocated.map(({key,remainder,cents,...row})=>{
    const group=totals.get(row.companyId)||{companyId:row.companyId,companyName:row.companyName,days:0,cents:0n};
    group.days+=row.days;group.cents+=cents;totals.set(row.companyId,group);
    return {...row,amountCents:String(cents)};
  });
  return {previewOnly:true,currency:'EUR',period,reference:reference.trim(),markupBps:5000,baseCents:String(baseCents),markupCents:String(totalCents-baseCents),totalCents:String(totalCents),totalDays,stores,
    companies:[...totals.values()].map(({cents,...row})=>({...row,amountCents:String(cents)}))};
}
export const sharedCostExampleCompanies=Object.freeze(['A','B','C'].map(letter=>({id:'example-'+letter,name:'Ενδεικτική εταιρεία '+letter,active:true,stores:[{id:'example-store-'+letter,name:'Ενδεικτικό κατάστημα '+letter,active:true}]})));
