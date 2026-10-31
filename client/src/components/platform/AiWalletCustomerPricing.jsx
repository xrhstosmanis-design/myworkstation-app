import React,{useState} from 'react';
import {walletMoney} from '../voice/ai-wallet-money.mjs';
import {pricingPolicy,pricingDecimalText} from './ai-wallet-customer-pricing.mjs';
export default function AiWalletCustomerPricing({policy={},busy,onSave}){
  const [percentage,setPercentage]=useState(()=>pricingDecimalText(policy.additionalMarkupBps,2)),[callFee,setCallFee]=useState(()=>pricingDecimalText(policy.callFeeMicros,6)),[invoiceFee,setInvoiceFee]=useState(()=>pricingDecimalText(policy.invoiceFeeMicros,6)),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
  let parsed,preview;
  try{parsed=pricingPolicy({percentage,callFee,invoiceFee});preview=1000000n+100n*BigInt(parsed.additionalMarkupBps)+BigInt(parsed.callFeeMicros)}catch{}
  const edit=setter=>e=>{setter(e.target.value);setConfirmed(false);setError('')};
  return <form aria-label="Τιμολόγηση AI πελάτη" onSubmit={e=>{e.preventDefault();try{const value=pricingPolicy({percentage,callFee,invoiceFee});if(!confirmed)throw new Error('Επιβεβαίωσε τις πρόσθετες χρεώσεις.');onSave(value)}catch(error){setError(error.message)}}}>
    <h2>Τιμές AI για αυτή την εταιρεία</h2>
    <p>Οι τρεις χρεώσεις συνδυάζονται και ισχύουν για όλα τα καταστήματα αυτής της εταιρείας. Το 0 απενεργοποιεί την αντίστοιχη πρόσθετη χρέωση.</p>
    <label>Πρόσθετη προσαύξηση (%) <input inputMode="decimal" value={percentage} disabled={busy} onChange={edit(setPercentage)} required/></label>
    <p>Υπολογίζεται πάνω στη σημερινή τιμή χρήσης, η οποία περιλαμβάνει ήδη τη συμφωνημένη προσαύξηση 50%.</p>
    <label>Σταθερό ποσό ανά κλήση AI (€) <input inputMode="decimal" value={callFee} disabled={busy} onChange={edit(setCallFee)} required/></label>
    <label>Σταθερό ποσό ανά τιμολόγιο στον βοηθό (€) <input inputMode="decimal" value={invoiceFee} disabled={busy} onChange={edit(setInvoiceFee)} required/></label>
    <p>Το ποσό τιμολογίου προστίθεται μία φορά, στην πρώτη κλήση του βοηθού στο αποθηκευμένο πρόχειρο. Οι φωτογραφίες και οι επόμενες κλήσεις στο ίδιο παραστατικό δεν το προσθέτουν ξανά. Η αρχική ανάγνωση πριν δημιουργηθεί το πρόχειρο έχει μόνο χρήση και ποσό ανά κλήση.</p>
    <p>Τελική χρέωση = πραγματική χρήση + πρόσθετη προσαύξηση + ποσό ανά κλήση + ποσό τιμολογίου όπου εφαρμόζεται.</p>
    {parsed?<p aria-label="Παράδειγμα χρέωσης">Παράδειγμα για χρήση 1,00 €: {walletMoney(preview)} ανά κλήση· {walletMoney(preview+BigInt(parsed.invoiceFeeMicros))} στην πρώτη κλήση του βοηθού σε νέο τιμολόγιο. Τα ποσά είναι παράδειγμα υπολογισμού.</p>:<p role="alert">Έλεγξε τις τιμές: ποσοστό έως δύο δεκαδικά, ποσά έως έξι δεκαδικά.</p>}
    <p>Οι νέες τιμές εφαρμόζονται σε επόμενες κλήσεις. Η αποθήκευση τιμών δεν ενεργοποιεί τη χρέωση και δεν πιστώνει υπόλοιπο.</p>
    <label><input type="checkbox" checked={confirmed} disabled={busy||!parsed} onChange={e=>setConfirmed(e.target.checked)}/> Επιβεβαιώνω τις πρόσθετες χρεώσεις αυτής της εταιρείας.</label>
    {error&&<p role="alert">{error}</p>}
    <button disabled={busy||!parsed||!confirmed}>Αποθήκευση τιμών AI</button>
  </form>;
}
