import React,{useCallback,useEffect,useRef,useState} from 'react';
import WholesaleB2BPanel from './WholesaleB2BPanel.jsx';
import SellerWorkspace from '../field-sales/SellerWorkspace.jsx';

const managers=new Set(['SUPER_ADMIN','OWNER','ADMIN','MANAGER']);
export function readWholesaleIdentity(){
  try{
    const token=localStorage.getItem('token'),user=JSON.parse(localStorage.getItem('user')||'null');
    if(!token||!user)return {userId:'',companyId:'',role:''};
    let claims={};try{claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))}catch{}
    if((claims.exp&&claims.exp*1000<=Date.now())||(claims.tokenType&&claims.tokenType!=='BACKOFFICE_USER'))return {userId:'',companyId:'',role:''};
    return {userId:claims.id||user.id||'',companyId:claims.companyId||user.companyId||'',role:claims.role||user.role||''};
  }catch{return {userId:'',companyId:'',role:''}}
}
export const wholesaleIdentityKey=identity=>identity?.userId&&identity?.companyId?JSON.stringify([identity.userId,identity.companyId]):'';
export function wholesaleAccessEnabled(access,identity){
  return Boolean(wholesaleIdentityKey(identity)&&access?.moduleKey==='WHOLESALE_B2B'&&access.enabled===true&&access.companyId===identity.companyId&&(access.expiresAt==null||(Number.isFinite(Date.parse(access.expiresAt))&&Date.parse(access.expiresAt)>Date.now())));
}

export default function WholesaleSuiteWorkspace({api,stores=[],activeStoreId='',identity,access,getAccess=()=>access,onRefreshAccess,onSubmissionLockChange}){
  const owner=useRef(wholesaleIdentityKey(identity)),gate=useRef({api,identity,access,getAccess,onRefreshAccess}),lock=useRef(false),lockCallback=useRef(onSubmissionLockChange);
  const [locked,setLocked]=useState(false),[view,setView]=useState(()=>managers.has(identity?.role)?'management':'seller');
  gate.current={api,identity,access,getAccess,onRefreshAccess};lockCallback.current=onSubmissionLockChange;
  const manager=managers.has(identity?.role),sameIdentity=owner.current===wholesaleIdentityKey(identity),usable=sameIdentity&&wholesaleAccessEnabled(access,identity)&&(view!=='management'||manager);
  const childLock=useCallback(value=>{lock.current=Boolean(value);setLocked(Boolean(value));lockCallback.current?.(Boolean(value))},[]);
  useEffect(()=>{if(!locked&&!manager)setView('seller')},[locked,manager]);
  const guardedApi=useCallback(async(path,options)=>{
    const before=gate.current,live=readWholesaleIdentity();
    if(owner.current!==wholesaleIdentityKey(live)||!wholesaleAccessEnabled(before.getAccess(),live)){before.onRefreshAccess?.();throw Object.assign(Error('Η πρόσβαση χονδρικής χρειάζεται επανέλεγχο με τον αρχικό λογαριασμό.'),{status:401,code:'WHOLESALE_ACCESS_RECHECK'});}
    try{
      const result=await before.api(path,options);
      const after=gate.current,current=readWholesaleIdentity();
      if(owner.current!==wholesaleIdentityKey(current)||!wholesaleAccessEnabled(after.getAccess(),current))throw Object.assign(Error('Η πρόσβαση άλλαξε πριν επιβεβαιωθεί η αίτηση.'),{status:401,code:'WHOLESALE_ACCESS_RECHECK'});
      return result;
    }catch(error){if(error.status===401||error.code==='WHOLESALE_MODULE_DISABLED')gate.current.onRefreshAccess?.();throw error}
  },[]);
  return <section className="wholesale-suite" aria-label="Χονδρική B2B">
    {!usable&&<div role="status"><p>{locked?'Εκκρεμεί επιβεβαίωση παραγγελίας του αρχικού λογαριασμού. Το αίτημα διατηρείται μέχρι να επανέλθει η πρόσβαση.':'Η πρόσβαση χονδρικής δεν είναι διαθέσιμη.'}</p><button type="button" onClick={()=>onRefreshAccess?.()}>Επανέλεγχος πρόσβασης χονδρικής</button></div>}
    <div hidden={!usable}>
      {manager&&<nav aria-label="Ενότητες χονδρικής"><button disabled={locked} type="button" onClick={()=>{if(!lock.current)setView('management')}}>Χονδρική, site & αναθέσεις</button><button disabled={locked} type="button" onClick={()=>{if(!lock.current)setView('seller')}}>Εργασία πωλητή</button></nav>}
      {view==='management'?<WholesaleB2BPanel suspended={!usable} api={guardedApi} stores={stores} activeStoreId={activeStoreId} onSubmissionLockChange={childLock}/>:<SellerWorkspace suspended={!usable} api={guardedApi} activeStoreId={activeStoreId} onSubmissionLockChange={childLock}/>}
    </div>
  </section>;
}
