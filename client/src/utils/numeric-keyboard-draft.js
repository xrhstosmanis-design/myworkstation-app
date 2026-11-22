// A pending separator is valid editing state, but not a valid HTML number value.
// Keep it in the keyboard until a digit makes the committed value unambiguous.
export function editNumericKeyboardDraft(value,key){
 const current=String(value??'').replace(',','.');
 if(key==='CLEAR')return '';
 if(key==='BACK')return current.slice(0,-1);
 if(key==='MINUS')return current.startsWith('-')?current.slice(1):`-${current}`;
 if(key===','||key==='.')return current.includes('.')?current:`${current===''?'0':current==='-'?'-0':current}.`;
 if(!/^\d$/.test(key))return current;
 const next=current+key;
 return /^-?\d*(?:\.\d*)?$/.test(next)&&Number.isFinite(Number(next))?next:current;
}
export function numericKeyboardValue(draft){
 if(draft==='')return '';
 if(!/^-?\d+(?:\.\d*)?$/.test(draft))return null;
 const value=draft.endsWith('.')?draft.slice(0,-1):draft;
 return Number.isFinite(Number(value))?value:null;
}
