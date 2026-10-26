const money=value=>value==null?'άγνωστο':Number(value).toLocaleString('el-GR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const when=value=>value&&Number.isFinite(new Date(value).getTime())?new Date(value).toLocaleString('el-GR',{timeZone:'Europe/Athens',hour12:false}):'άγνωστη ώρα';
export function cashChatEvidenceLines(evidence){
  if(!evidence)return [];
  const chat=evidence.chatEvidence,lines=[];
  if(chat?.status==='NOT_AUTHORIZED')lines.push('Δεν υπάρχει πρόσβαση στα χειρόγραφα του τσατ για αυτόν τον έλεγχο.');
  if(chat && chat.status!=='NOT_AUTHORIZED'){
    if(chat.status==='UNAVAILABLE')lines.push('Τσατ καταστήματος: μη διαθέσιμη πηγή χειρόγραφων — εκκρεμεί έλεγχος.');
    else{
      lines.push(`Τσατ καταστήματος: ${chat.sources?.length||0} διαφορετικά συνημμένα στην πρόσφατη αναζήτηση${chat.status==='LIMITED'?' (περιορισμένη κάλυψη)':''}. Η ανάγνωση και η αντιστοίχιση εμφανίζονται στην ενότητα «Χειρόγραφα καταστήματος». Η ώρα ανεβάσματος δεν είναι ημερομηνία παραστατικού.`);
      for(const source of chat.sources||[])for(const ref of source.references||[])lines.push(`Συνημμένο προς έλεγχο: ${ref.filename||'χωρίς όνομα'} · μήνυμα ${ref.messageId}.`);
    }
  }
  const labels={MATCHED:'Συμφωνούν τα καταγεγραμμένα ποσά',MISMATCH:'Διαφορά παράδοσης–παραλαβής — υπό έλεγχο',OVERLAP:'Επικάλυψη βαρδιών — υπό έλεγχο',MISSING_AMOUNTS:'Λείπουν ποσά παράδοσης–παραλαβής',PREVIOUS_SHIFT_NOT_CLOSED:'Η προηγούμενη βάρδια δεν έχει έγκυρο κλείσιμο',AWAITING_NEXT_SHIFT:'Αναμονή επόμενης βάρδιας'};
  if(evidence.handoffs?.status==='UNAVAILABLE')lines.push('Συνέχεια παράδοσης–παραλαβής: μη διαθέσιμα στοιχεία.');
  for(const row of evidence.handoffs?.rows||[])lines.push(`Παράδοση ${row.previousOperator||row.previousSessionId} → ${row.nextOperator||row.nextSessionId||'επόμενη βάρδια'}: ${labels[row.status]||'Υπό έλεγχο'}${row.nextSessionId?` · ${when(row.closedAt)} → ${when(row.openedAt)} · λήξη ${money(row.closingOperational)}, έναρξη ${money(row.openingOperational)}, διαφορά ${money(row.difference)}`:''}${row.nextSessionId&&!row.nextShiftClosed?' · αναμονή κλεισίματος επόμενης βάρδιας':''}.`);
  return lines;
}
