import React from "react";
import {cashReportPeriod} from "../../lib/cash-report-period.js";

export default function CashReportPeriodFields({period,date,from,to,onPeriod,onDate,onFrom,onTo}){
  let range=null;try{range=cashReportPeriod({period,date,from,to})}catch{}
  return <>
    <label>Περίοδος<select value={period} onChange={e=>onPeriod(e.target.value)}>
      <option value="DAY">Ημέρα</option><option value="WEEK">Εβδομάδα</option>
      <option value="MONTH">Μήνας</option><option value="CUSTOM">Από–Έως</option>
    </select></label>
    {period==="CUSTOM"?<><label>Από<input type="date" value={from} onChange={e=>onFrom(e.target.value)}/></label><label>Έως<input type="date" value={to} onChange={e=>onTo(e.target.value)}/></label></>:<label>Ημερομηνία<input type="date" value={date} onChange={e=>onDate(e.target.value)}/></label>}
    <small role="status">{range?`${range.from} έως ${range.to} · Ημερομηνία κλεισίματος, ώρα Ελλάδας`:"Επίλεξε έγκυρη περίοδο"}</small>
  </>;
}
