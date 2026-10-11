import {useMemo,useState} from "react";

// Display preferences stay on this browser, separated by tenant, store and person.
export function usePosKeypadPreference({company,store,operator}) {
  const companyId=company?.id||store?.companyId||operator?.companyId||null;
  const storeId=store?.id||null;
  const operatorId=operator?.employeeId||operator?.id||null;
  const scope=JSON.stringify([companyId,storeId,operatorId]);
  const key=companyId&&storeId&&operatorId?`myworkstation:pos-keypad:${scope}`:null;
  const saved=useMemo(()=>{
    try {return !key||localStorage.getItem(key)!=="hidden"}
    catch {return true}
  },[key]);
  const [choices,setChoices]=useState({});
  const visible=Object.hasOwn(choices,scope)?choices[scope]:saved;
  const setVisible=next=>{
    const value=typeof next==="function"?Boolean(next(visible)):Boolean(next);
    setChoices(current=>({...current,[scope]:value}));
    try {if(key)localStorage.setItem(key,value?"visible":"hidden")}
    catch {/* Storage restrictions must not prevent using the display toggle. */}
  };
  return [visible,setVisible];
}
