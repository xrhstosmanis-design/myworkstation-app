import {suggestionUnit} from './order-suggestions.js';
export const stockAlarmDefaults=Object.freeze({enabled:false,historyDays:28,leadDays:3,safetyDays:2,floor:0});
const finite=(x)=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
export function stockAlarmPolicy(input={}){
 const p={...stockAlarmDefaults,...input};
 if(typeof p.enabled!=='boolean'||!Number.isInteger(p.historyDays)||p.historyDays<7||p.historyDays>90||!Number.isInteger(p.leadDays)||p.leadDays<0||p.leadDays>30||!Number.isInteger(p.safetyDays)||p.safetyDays<0||p.safetyDays>30||!finite(p.floor)||Number(p.floor)<0||Number(p.floor)>1e8)throw new RangeError('Μη έγκυρες ρυθμίσεις alarm stock.');
 return {...p,floor:Number(p.floor)};
}
export function stockAlarmWeek(now=new Date()){
 if(!Number.isFinite(now.getTime()))throw new RangeError('Μη έγκυρη ημερομηνία.');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=k=>Number(parts.find(p=>p.type===k).value),d=new Date(Date.UTC(part('year'),part('month')-1,part('day')));
 d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);
}
export function calculateWeeklyStockAlarm(row,input={},now=new Date()){
 const p=stockAlarmPolicy(input),current=finite(row.minStock)?Number(row.minStock):row.minStock==null?0:null;
 const result={productId:row.productId,previousMinimum:current,nextMinimum:current,status:'HELD',reason:'',dailyDemand:null,warnings:[]};
 const hold=reason=>({...result,reason});
 if(!p.enabled)return hold('DISABLED');
 if(row.mode==='MANUAL')return hold('MANUAL_OVERRIDE');
 if(row.lastApplied!=null&&(row.minStock==null||!finite(row.lastApplied)||current!==Number(row.lastApplied)))return hold('MANUAL_CHANGE_DETECTED');
 const unit=suggestionUnit(row.unit);
 if(!unit||row.hasRecipe)return hold('UNIT_OR_RECIPE_REVIEW');
 if(current===null||current<0||!finite(row.soldQuantity)||!finite(row.returnedQuantity)||Number(row.soldQuantity)<0||Number(row.returnedQuantity)<0||!finite(row.currentStock)||Number(row.currentStock)<0)return hold('INVALID_OR_NEGATIVE_STOCK');
 const since=new Date(row.createdAt);if(!Number.isFinite(since.getTime())||now-since<p.historyDays*86400000)return hold('INSUFFICIENT_HISTORY');
 if((row.floor!=null&&!finite(row.floor))||(row.baselineMinimum!=null&&!finite(row.baselineMinimum)))return hold('INVALID_FLOOR');
 const baseline=finite(row.baselineMinimum)?Number(row.baselineMinimum):current;
 const floor=Math.max(p.floor,baseline,finite(row.floor)?Number(row.floor):0);
 if(floor<0||floor>1e8)return hold('INVALID_FLOOR');
 const net=Math.max(0,Number(row.soldQuantity)-Number(row.returnedQuantity));
 result.dailyDemand=net/p.historyDays;
 const raw=Math.max(floor,result.dailyDemand*(p.leadDays+p.safetyDays));
 if(!Number.isFinite(raw)||raw>1e8)return hold('NUMERIC_LIMIT');
 let next=unit.step===1?Math.ceil(raw-1e-9):Math.ceil(raw*1000-1e-7)/1000;
 // Sales alone do not establish that a product was available all day or not promoted.
 // Increases are conservative; decreases require explicit complete source evidence.
 if(row.availabilityComplete!==true)result.warnings.push('AVAILABILITY_HISTORY_UNVERIFIED');
 if(row.promotionHistoryComplete!==true)result.warnings.push('PROMOTION_HISTORY_UNVERIFIED');
 if(next<current&&result.warnings.length)return {...result,reason:'DECREASE_REQUIRES_COMPLETE_HISTORY'};
 return {...result,status:next===current?'UNCHANGED':'APPLY',nextMinimum:next,reason:'SALES_LEAD_AND_SAFETY'};
}
