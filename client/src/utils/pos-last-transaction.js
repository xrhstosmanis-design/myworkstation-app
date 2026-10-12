import {useRef,useState} from 'react';

export function completedPosAmount(value){
  if(typeof value!=='number'&&(typeof value!=='string'||!value.trim()))return null;
  const amount=Number(value);
  return Number.isFinite(amount)&&Number.isSafeInteger(Math.round(amount*100))?amount:null;
}

export function usePosLastTransaction(scope){
  const current=useRef(null);
  if(current.current?.scope!==scope)current.current={scope,seen:new Set()};
  const frame=current.current;
  const [entry,setEntry]=useState(null);
  const remember=(value,identity)=>{
    const amount=completedPosAmount(value);
    if(current.current!==frame||amount===null||typeof identity!=='string'||!identity||frame.seen.has(identity))return;
    frame.seen.add(identity);
    setEntry({frame,amount});
  };
  const reset=()=>{if(current.current===frame)setEntry({frame,amount:0})};
  return {amount:entry?.frame===frame?entry.amount:0,remember,reset};
}
