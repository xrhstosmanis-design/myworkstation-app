import {businessDomains} from './assistant-business.mjs';
const euro=n=>Number(n).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
export function businessReportAnswer(r){
 const period=r.currentSnapshot?'Τρέχοντα καταγεγραμμένα στοιχεία':`${r.from} έως ${r.to}`;
 const label=`${businessDomains[r.domain]||'Αναφορά'} · ${r.storeName} · ${period}`;
 const limitations=[r.incompletePeriod?`Στοιχεία έως ${r.asOf}· η περίοδος δεν έχει ολοκληρωθεί.`:'',r.domain==='INVOICES'?'Τα πρόχειρα διακρίνονται από τα εγκεκριμένα παραστατικά. Δεν αθροίζονται πρόχειρα, εγκεκριμένα και πιστωτικά ως πραγματικές αγορές.':'',r.domain==='BANK_MOVEMENTS'?'Καταχωρημένες κινήσεις ανά κατάσταση, όχι διαθέσιμο υπόλοιπο τράπεζας.':'',r.domain==='POS_EVENTS'?'Μόνο καταχωρημένες ενέργειες POS, όχι το σύνολο συμβάντων όλων των ενοτήτων.':'',r.domain==='CASH_SHIFTS'?'Βάρδιες ταμείων με ημερομηνία έναρξης εντός του διαστήματος, όχι πρόγραμμα προσωπικού.':'',r.currentSnapshot?'Τρέχων κατάλογος του επιλεγμένου καταστήματος, όχι ιστορική εικόνα.':''].filter(Boolean).join(' ');
 if(r.truncated||r.result==='source_limited')return {answer:`${label}. ${r.reason} Δεν εξάγεται πλήρες ή μηδενικό αποτέλεσμα.`,highlights:[],limitations,sources:[r.source]};
 if(r.result==='no_records')return {answer:`${label}. Δεν βρέθηκαν καταχωρημένες εγγραφές στο συγκεκριμένο φίλτρο.`,highlights:[],limitations,sources:[r.source]};
 const n=r.totals?.count??r.rows.length;
 return {answer:`${label}.\nΒρέθηκαν ${n} καταχωρημένες εγγραφές.${r.totals?.amount!==null&&Number.isFinite(r.totals?.amount)?` Συνολικό καταχωρημένο ποσό: ${euro(r.totals.amount)}.`:''} Δες τις αναλυτικές γραμμές παρακάτω.`,highlights:[],limitations,sources:[r.source]};
}
