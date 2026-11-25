import React, {useEffect,useState} from 'react';
import {greeceDateInput} from '../../../../shared/greece-time.mjs';

import './store-financial-reports.css';

const modes = {
  monthly:'Πωλήσεις μήνα',
  categories:'Πωλήσεις ανά κατηγορία / υποκατηγορία',
  suppliers:'Πωλήσεις ανά προμηθευτή',
  products:'Πωλήσεις συγκεκριμένου είδους'
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
    api('/api/commerce/sales/financial-reports?' + query,{signal:controller.signal,cache:'no-store'})
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

export default function StoreFinancialReports({api,store,version=0}) {
  const today = greeceDateInput();
  const [mode,setMode] = useState('monthly');
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
  const options = useReport(api,store.id,range && {
    ...range,report:mode,search:mode==='products'?searchTerm:''
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
    <div className="store-financial-filters">
      <label>Αναφορά<select value={mode} onChange={event=>changeMode(event.target.value)}>
        {Object.entries(modes).map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Μήνας<input type="month" value={from.slice(0,7)} max={today.slice(0,7)} onChange={event=>changeMonth(event.target.value)}/></label>
      <label>Από<input type="date" value={from} max={to||undefined} onChange={event=>setFrom(event.target.value)}/></label>
      <label>Έως<input type="date" value={to} min={from||undefined} max={today} onChange={event=>setTo(event.target.value)}/></label>
      {mode==='products'&&<label>Όνομα, SKU ή barcode<input value={search} maxLength={120}
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
    {mode==='products'&&rows.length===100&&<p>Χρησιμοποίησε όνομα ή barcode για πιο συγκεκριμένα αποτελέσματα.</p>}
    {mode==='suppliers'&&<p>Η αναφορά χρησιμοποιεί τις ενεργές συνδέσεις ειδών με προμηθευτές. Ένα είδος με πολλούς προμηθευτές εμφανίζεται στην αναφορά καθενός.</p>}
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
