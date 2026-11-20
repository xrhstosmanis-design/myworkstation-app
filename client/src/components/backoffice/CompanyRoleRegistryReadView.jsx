import React,{useEffect,useRef,useState} from 'react';
import '../platform/workforce-v2-employees.css';
const keys=['id','companyId','name','code','description','active','employeeCount','shiftTemplateCount','createdAt','updatedAt'];
const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...fields].sort().join('|');
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const count=value=>Number.isSafeInteger(value)&&value>=0;
export default function CompanyRoleRegistryReadView({api,companyId,authorityKey}){
 const [state,setState]=useState(null),[error,setError]=useState(null),[reload,setReload]=useState(0);const sequence=useRef(0),own=JSON.stringify([companyId,authorityKey]),scope=useRef(own);scope.current=own;
 useEffect(()=>{const n=++sequence.current,controller=new AbortController();setState(null);setError(null);if(!companyId)return;
 api('/api/backoffice-staff/company/workforce-roles',{signal:controller.signal,headers:{'x-backoffice-company-id':companyId}}).then(data=>{if(n!==sequence.current||scope.current!==own)return;
 if(!exact(data,['scope','companyId','items','count'])||data.scope!=='COMPANY'||data.companyId!==companyId||!Array.isArray(data.items)||data.count!==data.items.length||data.items.length>10000||new Set(data.items.map(row=>row?.id)).size!==data.items.length||data.items.some(row=>!exact(row,keys)||typeof row.id!=='string'||!row.id||row.companyId!==companyId||typeof row.name!=='string'||typeof row.code!=='string'||!(row.description===null||typeof row.description==='string')||typeof row.active!=='boolean'||!count(row.employeeCount)||!count(row.shiftTemplateCount)||!stamp(row.createdAt)||!stamp(row.updatedAt)))throw Error('Δεν επιβεβαιώθηκε το μητρώο ρόλων της εταιρείας.');setState({own,api,items:data.items})
 }).catch(e=>{if(n===sequence.current&&scope.current===own){setState(null);setError({own,api,message:e.message||'Δεν επιβεβαιώθηκε το μητρώο ρόλων.'})}});
 return()=>{sequence.current++;controller.abort()};
 },[api,companyId,authorityKey,reload]);
 const rows=state?.own===own&&state.api===api?state.items:null,message=error?.own===own&&error.api===api?error.message:'';
 return <section aria-label="Μητρώο ρόλων εταιρείας"><button type="button" onClick={()=>{sequence.current++;setState(null);setError(null);setReload(value=>value+1)}}>Ανανέωση μητρώου ρόλων εταιρείας</button>{message&&<p role="alert">{message}</p>}{!rows&&!message&&<p role="status">Φόρτωση…</p>}{rows&&<><h3>Ρόλοι εταιρείας</h3><p>Ολόκληρο το μητρώο της εταιρείας, με πλήθη εργαζομένων και προτύπων σε όλα τα καταστήματά της.</p><div className="workforce-role-list">{rows.map(row=><article key={row.id} className={row.active?'':'inactive'}><div><b>{row.name}</b><code>{row.code}</code><span>{row.description??'Χωρίς περιγραφή'}</span></div><small>{row.employeeCount} εργαζόμενοι · {row.shiftTemplateCount} πρότυπα · {row.active?'Ενεργός':'Ανενεργός'}</small></article>)}</div>{rows.length===0&&<p>Δεν υπάρχουν καταχωρισμένοι ρόλοι στην εταιρεία.</p>}</>}</section>;
}
