import React, {useEffect,useState} from 'react';
import {greeceDateInput} from '../../../../shared/greece-time.mjs';

import './store-financial-reports.css';
import {operationalFinancialReports} from '../../../../shared/financial-consumption.mjs';

const modes = {
  monthly:'Πωλήσεις μήνα',
  categories:'Πωλήσεις ανά κατηγορία / υποκατηγορία',
  suppliers:'Πωλήσεις ανά προμηθευτή',
  products:'Πωλήσεις συγκεκριμένου είδους',
  ...Object.fromEntries(Object.entries(operationalFinancialReports).map(([key,r])=>[key,r.label]))
};
const euro = new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR'});
const number = new Intl.NumberFormat('el-GR',{maximumFractionDigits:2});
const dayLabel = day => day.split('-').reverse().join('/');

function useReport(api, storeId, params, version) {
  const query = params && new URLSearchParams({storeId,...params}).toString();
  const [response,setResponse] = useState(null);
  useEffect(()=>{
    if(!query)return;
    const controller = new AbortController();
    const set = result => {
      if(!controller.signal.aborted)setResponse({query,api,version,...result});
    };
    set({loading:true});
    const suffix=operationalFinancialReports[params.report]?'/'+params.report:'';
    api('/api/commerce/sales/financial-reports'+suffix+'?' + query,{signal:controller.signal,cache:'no-store'})
      .then(data=>{
        if(data.storeId!==storeId)throw Error('Δεν επιβεβαιώθηκε το επιλεγμένο κατάστημα.');
        set({data});
      }).catch(error=>set({error:error.message||'Η αναφορά δεν φορτώθηκε.'}));
    return ()=>controller.abort();
  },[api,query,storeId,version]);
  if(!query)return {};
  return response?.query===query && response.api===api && response.version===version
    ? response : {loading:true};
}

export default function StoreFinancialReports({api,store,version=0,allowedModes=Object.keys(modes)}) {
  const today = greeceDateInput();
  const [requestedMode,setMode] = useState('monthly');
  const enabledModes=Object.keys(modes).filter(key=>allowedModes.includes(key));
  const mode=enabledModes.includes(requestedMode)?requestedMode:enabledModes[0]||'';
  const operational=Boolean(operationalFinancialReports[mode]);
  const [from,setFrom] = useState(today.slice(0,7)+'-01');
  const [to,setTo] = useState(today);
  const [selected,setSelected] = useState('');
  const [search,setSearch] = useState('');
  const [searchTerm,setSearchTerm] = useState('');
  useEffect(()=>{
    const timer = setTimeout(()=>setSearchTerm(search.trim()),250);
    return ()=>clearTimeout(timer);
  },[search]);

  const range = from && to && from<=to ? {from,to} : null;
  const options = useReport(api,store.id,range && mode && {
    ...range,report:mode,search:mode==='products'||operational?searchTerm:''
  },version);
  const rows = options.data?.rows || [];
  const choice = rows.find(row=>row.id===selected);
  const detailMode = {categories:'category-items',suppliers:'supplier-items',products:'product-days'}[mode];
  const detail = useReport(api,store.id,range && choice && detailMode && {
    ...range,report:detailMode,key:choice.id
  },version);

  function changeMonth(month) {
    if(!month)return;
    const [year,monthNumber] = month.split('-').map(Number);
    const last = new Date(Date.UTC(year,monthNumber,0)).toISOString().slice(0,10);
    setFrom(month+'-01');
    setTo(last>today?today:last);
  }

  function changeMode(value) {
    setMode(value);
    setSelected('');
    setSearch('');
    setSearchTerm('');
  }

  return <section className="panel store-financial-reports" aria-label="Οικονομικές αναφορές">
    <h2>Οικονομικές αναφορές · {store.name}</h2>
    <div className="store-financial-operation-choices" aria-label="Καταστροφές και ιδιοκατανάλωση">
      {Object.entries(operationalFinancialReports).filter(([key])=>enabledModes.includes(key)).map(([key,r])=>
        <button type="button" key={key} aria-pressed={mode===key} onClick={()=>changeMode(key)}>{r.label}</button>)}
    </div>
    {!enabledModes.length&&<p role="status">Δεν υπάρχει ενεργό δικαίωμα οικονομικής αναφοράς.</p>}
    <div className="store-financial-filters">
      <label>Αναφορά<select value={mode} onChange={event=>changeMode(event.target.value)}>
        {Object.entries(modes).filter(([key])=>enabledModes.includes(key)).map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Μήνας<input type="month" value={from.slice(0,7)} max={today.slice(0,7)} onChange={event=>changeMonth(event.target.value)}/></label>
      <label>Από<input type="date" value={from} max={to||undefined} onChange={event=>setFrom(event.target.value)}/></label>
      <label>Έως<input type="date" value={to} min={from||undefined} max={today} onChange={event=>setTo(event.target.value)}/></label>
      {(mode==='products'||operational)&&<label>{operational?'Όνομα ή SKU':'Όνομα, SKU ή barcode'}<input value={search} maxLength={120}
        onChange={event=>{setSearch(event.target.value);setSelected('');}}/></label>}
      {(mode==='suppliers'||mode==='products')&&<label>{mode==='suppliers'?'Προμηθευτής':'Είδος'}
        <select value={choice?.id||''} disabled={!rows.length||(mode==='products'&&search.trim()!==searchTerm)}
          onChange={event=>setSelected(event.target.value)}>
          <option value="">Επίλεξε</option>
          {rows.map(row=><option key={row.id} value={row.id}>{row.name}{row.sku?' · '+row.sku:''}</option>)}
        </select>
      </label>}
    </div>
    {!range&&<p role="status">Επίλεξε έγκυρη περίοδο.</p>}
    {(options.loading||detail.loading)&&<p role="status">Φόρτωση αναφοράς…</p>}
    {(options.error||detail.error)&&<p role="alert">{options.error||detail.error}</p>}
    {options.data&&!rows.length&&<p>Δεν βρέθηκαν αποτελέσματα για τα επιλεγμένα φίλτρα.</p>}
    {!operational&&mode==='products'&&rows.length===100&&<p>Χρησιμοποίησε όνομα ή barcode για πιο συγκεκριμένα αποτελέσματα.</p>}
    {mode==='suppliers'&&<p>Η αναφορά χρησιμοποιεί τις ενεργές συνδέσεις ειδών με προμηθευτές. Ένα είδος με πολλούς προμηθευτές εμφανίζεται στην αναφορά καθενός.</p>}
    {options.data&&operational&&<ConsumptionResults data={options.data}/> }
    {options.data&&mode==='monthly'&&<Results data={options.data} kind="monthly" from={from}/>}
    {options.data&&mode==='categories'&&<Results data={options.data} kind="categories" selected={choice?.id} onSelect={setSelected}/>}
    {detail.data&&<><h3>{choice.name}</h3><Results data={detail.data} kind={detailMode} from={from}/></>}
  </section>;
}

function Results({data,kind,selected,onSelect,from}) {
  const {rows,days} = data;
  const monthly = kind==='monthly';
  const dated = monthly||kind==='product-days';
  const totals = rows.reduce((sum,row)=>({
    revenue:sum.revenue+Number(row.revenue||0),
    quantity:sum.quantity+Number(row.quantity||0),
    sales:sum.sales+Number(row.sales||0)
  }),{revenue:0,quantity:0,sales:0});
  const byDay = new Map(rows.map(row=>[row.day,row]));
  const displayRows = dated ? Array.from({length:days},(_,offset)=>{
    const day = new Date(Date.parse(from)+offset*86400000).toISOString().slice(0,10);
    return byDay.get(day)||{day,sales:0,revenue:0,quantity:0};
  }) : rows;
  return <div className="store-financial-table">
    <table>
      <thead><tr><th scope="col">{dated?'Ημέρα':kind==='categories'?'Κατηγορία / υποκατηγορία':'Είδος'}</th>
        <th scope="col">{monthly?'Πωλήσεις':'Τεμάχια'}</th><th scope="col">Αξία πωλήσεων</th>
        {!monthly&&!dated&&<th scope="col">Μ.Ο. τεμαχίων / ημέρα</th>}</tr></thead>
      <tbody>{displayRows.map(row=><tr key={row.day||JSON.stringify([row.id,row.name])}>
        <th scope="row">{dated?dayLabel(row.day):onSelect?<button type="button" aria-pressed={selected===row.id}
          onClick={()=>onSelect(row.id)}>{row.name}</button>:row.name+(row.sku?' · '+row.sku:'')}</th>
        <td>{number.format(monthly?row.sales:row.quantity)}</td><td>{euro.format(row.revenue)}</td>
        {!monthly&&!dated&&<td>{number.format(Number(row.quantity)/days)}</td>}
      </tr>)}</tbody>
      {kind!=='categories'&&<tfoot><tr><th scope="row">Σύνολο περιόδου</th><td>{number.format(monthly?totals.sales:totals.quantity)}</td>
        <td>{euro.format(totals.revenue)}</td>{!monthly&&!dated&&<td>{number.format(totals.quantity/days)}</td>}</tr></tfoot>}
    </table>
    {dated&&<p>Μέσος όρος ανά ημέρα ({days} ημερολογιακές ημέρες){monthly
      ? ' · '+euro.format(totals.revenue/days)
      : ' · '+number.format(totals.quantity/days)+' τεμ. · '+euro.format(totals.revenue/days)}</p>}
  </div>;
}

function ConsumptionResults({data}) {
  const value=n=>n===null?'Μη διαθέσιμο':euro.format(n);
  return <div className="store-financial-table">
    <p>{data.purchaseBasis}</p><p>{data.saleBasis}</p>
    {data.truncated&&<p role="alert">Πάνω από {data.limit} γραμμές. Επίλεξε μικρότερο διάστημα ή συγκεκριμένο είδος. Δεν εμφανίζεται πλήρες τελικό σύνολο.</p>}
    {Boolean(data.missingPurchase||data.missingSale)&&<p role="status">Ελλιπής αποτίμηση: {data.missingPurchase} γραμμές χωρίς τιμή αγοράς και {data.missingSale} χωρίς τιμή πώλησης. Οι άγνωστες αξίες δεν υπολογίζονται ως μηδέν.</p>}
    <table><thead><tr><th>Ημερομηνία</th><th>Είδος</th><th>Ποσότητα</th><th>Τιμή αγοράς</th><th>Αξία αγοράς</th><th>Τιμή πώλησης</th><th>Αξία πώλησης</th><th>Χειριστής καταχώρισης</th><th>Αιτιολογία</th></tr></thead>
      <tbody>{data.rows.map(r=><tr key={r.id}><td>{new Date(r.createdAt).toLocaleString('el-GR',{timeZone:'Europe/Athens'})}</td><th scope="row">{r.name}{r.sku?' · '+r.sku:''}{r.source==='PRODUCT_CARD'?' · Καρτέλα είδους':''}</th><td>{number.format(r.quantity)} {r.unit||''}</td><td>{value(r.purchasePrice)}</td><td>{value(r.purchaseTotal)}</td><td>{value(r.salePrice)}</td><td>{value(r.saleTotal)}</td><td>{r.operatorName||'Μη καταγεγραμμένος'}</td><td>{r.note||'—'}</td></tr>)}</tbody>
      <tfoot><tr><th colSpan={4} scope="row">{data.periodComplete?'Τελικό σύνολο περιόδου':'Σύνολο καταχωρίσεων έως τώρα'}</th><td>{value(data.totalPurchase)}</td><td/><td>{value(data.totalSale)}</td><td colSpan={2}/></tr></tfoot>
    </table>
  </div>;
}
