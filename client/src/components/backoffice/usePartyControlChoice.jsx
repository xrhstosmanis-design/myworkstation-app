import React,{useState} from 'react';
import {companyPartyControlPrefix as prefix} from '../../../../shared/backoffice-staff-company-party-control.mjs';
import useCompanyConfigurationRead from './useCompanyConfigurationRead.js';
import {partyControlReadValid} from './partyControlReadValidation.js';
import {ConfigurationReadState} from './ConfigurationReadPresentation.jsx';
export default function usePartyControlChoice({api,companyId,authorityKey,customer}){
 const [draft,setDraft]=useState(''),[query,setQuery]=useState(''),[id,setId]=useState(''),[error,setError]=useState(''),dirty=draft.trim()!==query;
 const params=new URLSearchParams({activeOnly:'false'});if(customer)params.set('nonZeroOnly','false');if(query)params.set('q',query);
 const read=useCompanyConfigurationRead({api,companyId,authorityKey,path:prefix+(customer?'/customers':'/suppliers')+'?'+params,enabled:!dirty,validate:partyControlReadValid,context:{kind:'report',customer,q:query,activeOnly:false,nonZeroOnly:false}});
 const selected=read.data?.items.find(row=>row.id===id);
 const search=e=>{e.preventDefault();setId('');setError('');const q=draft.trim();if(q.length>120||/[\u0000-\u001f\u007f]/.test(q)){setError('Η αναζήτηση ονόματος δέχεται έως 120 χαρακτήρες.');return}setQuery(q);read.refresh()};
 return{selected,read,choose:setId,controls:<><form onSubmit={search}><label>Αναζήτηση ονόματος / ΑΦΜ / κωδικού καταλόγου<input aria-label="Αναζήτηση ονόματος καρτέλας" maxLength={120} value={draft} onChange={e=>{setDraft(e.target.value);setId('');setError('')}}/></label><button type="submit">Εύρεση συναλλασσομένου</button></form>{error&&<p role="alert">{error}</p>}{!dirty&&<ConfigurationReadState read={read}/>} {read.data&&<><p>Ονομαστική επιλογή από έως {read.data.window.limit} εγγραφές καταλόγου, μαζί με ανενεργές. Για άλλη εγγραφή χρησιμοποίησε την αναζήτηση. Δεν γίνεται αναζήτηση με πλήρη αριθμό κάρτας μέλους.</p><label>{customer?'Πελάτης':'Προμηθευτής'}<select aria-label="Ονομασία επιλεγμένης καρτέλας" value={id} onChange={e=>setId(e.target.value)}><option value="">Επίλεξε συναλλασσόμενο με το όνομά του</option>{read.data.items.map(row=><option key={row.id} value={row.id}>{row.name}{row.active?'':' · Ανενεργός'}</option>)}</select></label></>}</>};
}
