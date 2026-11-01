export const purposeLabels={STAFF_SCHEDULE:'AI κανόνες προγράμματος εργαζομένων',CASH_PAPER_READING:'Ανάγνωση χαρτιού ταμείου με AI',ONLINE_SEARCH:'Πληρωμένη αναζήτηση προϊόντος',PLATFORM_CUSTOMER_ASSISTANT:'Ανάλυση επιλεγμένου καταστήματος από Super Admin',OWNER_ASSISTANT:'Βοηθός Ιδιοκτήτη',INVOICE_ASSISTANT:'Βοηθός τιμολογίου',PAYMENT_HEADER_READ:'Ανάγνωση στοιχείων για πληρωμή',PAYMENT_INVOICE_READ:'Πλήρης ανάγνωση τιμολογίου από πληρωμή',INVOICE_READ:'Ανάγνωση τιμολογίου',INVOICE_RECHECK:'Επανέλεγχος ανάγνωσης τιμολογίου',INVOICE_UNSPECIFIED:'Τιμολόγιο — η επιμέρους λειτουργία δεν καταγράφηκε',TRIAL_GRANT:'Δοκιμαστική πίστωση από MyWorkStation',CREDIT:'Πίστωση είσπραξης',OTHER:'Άλλη λειτουργία AI'};
export const statusLabels={SETTLED:'Οριστική χρέωση',REVIEW:'Υπό έλεγχο',RESERVED:'Σε εξέλιξη · δεσμευμένο',CREDITED:'Πίστωση'};
export const sourceLabels={POS_OPERATOR:'Συνεδρία χειριστή POS',BACKOFFICE_USER:'Backoffice',DELEGATED_USER:'Προσωπική πρόσβαση Backoffice',SUPPORT:'Υποστήριξη Super Admin',BACKGROUND:'Αυτόματη εκτέλεση στο παρασκήνιο',UNKNOWN:'Δεν έχει καταγραφεί'};
export const roleLabels={SUPER_ADMIN:'Super Admin',OWNER:'Ιδιοκτήτης',ADMIN:'Διαχειριστής',MANAGER:'Υπεύθυνος',EMPLOYEE:'Υπάλληλος',CASHIER:'Ταμίας'};
export const surfaceLabels={WORKFORCE_PLANNER:'Πρόγραμμα εργαζομένων',CASH_REVIEW:'Έλεγχος χαρτιών ταμείου',PRODUCT_SEARCH:'Αναζήτηση προϊόντων',PLATFORM_ASSISTANT:'Βοηθός Super Admin',OWNER_ASSISTANT:'Βοηθός Ιδιοκτήτη',PAYMENT_ENTRY:'Φόρμα πληρωμής / παραλαβής τιμολογίου',INVOICE_WORKSPACE:'Τιμολόγια · Παραγγελίες & Αγορές',UNKNOWN:'Δεν έχει καταγραφεί'};
export const activityPurpose=e=>e.kind==='CREDIT'?(e.feature==='TRIAL_GRANT'?'TRIAL_GRANT':'CREDIT'):purposeLabels[e.activity?.purpose]?e.activity.purpose:purposeLabels[e.feature]?e.feature:['SERPER_GOOGLE','GOOGLE_CSE'].includes(e.feature)?'ONLINE_SEARCH':['INVOICE_OPENAI','INVOICE_AZURE','INVOICE_AI'].includes(e.feature)?'INVOICE_UNSPECIFIED':'OTHER';
export const activityActor=e=>e.kind==='CREDIT'?e.actionUser?{...e.actionUser,kind:'BACKOFFICE_USER'}:null:e.activity?.actor||null;
export const activityActorKey=e=>{const a=activityActor(e);return a?.id?(a.kind==='POS_OPERATOR'?'POS:':'USER:')+a.id:'UNKNOWN'};
export const activitySource=e=>e.activity?.execution==='BACKGROUND'?'BACKGROUND':sourceLabels[e.activity?.actor?.kind]?e.activity.actor.kind:'UNKNOWN';
export const activityProvider=e=>e.kind==='CREDIT'?'—':e.feature==='INVOICE_AZURE'?'Azure Document Intelligence':['INVOICE_OPENAI','OWNER_ASSISTANT','CASH_PAPER_READING','STAFF_SCHEDULE','PLATFORM_CUSTOMER_ASSISTANT'].includes(e.feature)?'OpenAI':e.feature==='SERPER_GOOGLE'?'Serper':e.feature==='GOOGLE_CSE'?'Google Custom Search':'Δεν έχει καταγραφεί';
export function filterWalletActivity(entries,filters){return entries.filter(e=>
  (!filters.purpose||activityPurpose(e)===filters.purpose)&&(!filters.actor||activityActorKey(e)===filters.actor)&&
  (!filters.store||(e.storeId||'COMPANY')===filters.store)&&(!filters.status||e.status===filters.status)&&(!filters.source||activitySource(e)===filters.source));}
export function walletActivityTotals(entries){
  let charged=0n,reserved=0n,credited=0n;
  for(const e of entries){if(e.kind==='CREDIT')credited+=BigInt(e.creditedMicros||0);else if(e.status==='SETTLED')charged+=BigInt(e.chargedMicros||0);else if(['RESERVED','REVIEW'].includes(e.status))reserved+=BigInt(e.reservedMicros||0);}
  return {charged:String(charged),reserved:String(reserved),credited:String(credited)};
}
