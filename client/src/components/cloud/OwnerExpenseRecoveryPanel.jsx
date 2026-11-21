import React,{useEffect,useMemo,useRef} from 'react';
import OtherExpenseReviewCenter from '../platform/OtherExpenseReviewCenter.jsx';
import {supplierExpenseRecoveryApi} from '../../lib/supplier-expense-recovery-api.mjs';

export default function OwnerExpenseRecoveryPanel({api,store,onClose,setMessage}){
  const current=useRef(null);
  const binding=useMemo(()=>({api,storeId:store.id}),[api,store.id]);
  current.current=binding;
  useEffect(()=>{current.current=binding;return()=>{if(current.current===binding)current.current=null;}},[binding]);
  const request=useMemo(()=>supplierExpenseRecoveryApi({api,storeId:store.id,isCurrent:()=>current.current===binding}),[binding]);
  return <OtherExpenseReviewCenter key={store.id} request={request} recoveryStore={store} onClose={onClose} setMessage={setMessage}/>;
}
