import React,{useId,useState} from "react";
import "./report-recipient-fields.css";

// Uses the existing validated Store.responsibleEmail contract (up to ten).
// The parent keys this component by company/store to discard unsaved recipients
// when a different store is opened. No recipient data is cached in the browser.
export default function ReportRecipientFields({defaultValue="",disabled=false}){
  const prefix=useId();
  const [rows,setRows]=useState(()=>{
    const values=String(defaultValue||"").split(/[,;]/).map(value=>value.trim()).filter(Boolean);
    return values.length?values:[""];
  });
  return <fieldset className="report-recipient-fields" disabled={disabled}>
    <legend>Παραλήπτες αναφορών</legend>
    <p>Προσθέστε ένα email σε κάθε γραμμή (έως 10 παραλήπτες).</p>
    <input type="hidden" name="responsibleEmail" value={rows.map(value=>value.trim()).filter(Boolean).join(", ")}/>
    {rows.map((value,index)=><div className="report-recipient-row" key={index}>
      <label htmlFor={`${prefix}-${index}`}>Email {index+1}
        <input id={`${prefix}-${index}`} aria-label={`Email παραλήπτη ${index+1}`} type="email" inputMode="email" autoComplete="off" maxLength={254} value={value} placeholder="name@example.gr" onChange={event=>setRows(current=>current.map((row,i)=>i===index?event.target.value:row))}/>
      </label>
      <button type="button" className="secondary" aria-label={`Αφαίρεση παραλήπτη ${index+1}`} onClick={()=>setRows(current=>current.length===1?[""]:current.filter((_,i)=>i!==index))}>Αφαίρεση</button>
    </div>)}
    <button type="button" className="secondary" disabled={rows.length>=10} onClick={()=>setRows(current=>[...current,""])}>+ Προσθήκη email</button>
    <small>Οι διπλές διευθύνσεις αποθηκεύονται μία φορά. Η αποθήκευση παραληπτών δεν στέλνει email.</small>
  </fieldset>;
}
