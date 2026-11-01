import React from 'react';
import {walletMoney} from './ai-wallet-money.mjs';
const labels={UNPAID:'Ανεξόφλητη',PARTIAL:'Μερική εξόφληση',PAID:'Εξοφλημένη'};
export default function AiWalletDebtSummary({summary}){
 if(!summary||summary.grantCount===0)return null;
 return <section aria-label="Οφειλή AI εταιρείας">
  <h3>Οφειλή AI προς εξόφληση: {walletMoney(summary.outstandingMicros)}</h3>
  <p>Η οφειλή αφορά συνολικά την εταιρεία. Η χρήση AI μειώνει το διαθέσιμο υπόλοιπο, όχι την οφειλή. Η εξόφληση δεν προσθέτει ξανά χρήματα στο υπόλοιπο.</p>
  <details><summary>Πιστώσεις επί πιστώσει και εξοφλήσεις</summary>
   <p>Όλες οι εκκρεμείς και έως 100 πρόσφατες εξοφλημένες πιστώσεις.</p>
   <div style={{overflowX:'auto'}}><table><thead><tr><th>Αναφορά</th><th>Πίστωση AI</th><th>Εξοφλήθηκε</th><th>Οφείλεται</th><th>Κατάσταση</th></tr></thead>
    <tbody>{summary.grants.map(g=><tr key={g.id}><td>{g.reference}</td><td>{walletMoney(g.amountMicros)}</td><td>{walletMoney(g.paidMicros)}</td><td>{walletMoney(g.outstandingMicros)}</td><td>{labels[g.status]}</td></tr>)}</tbody>
   </table></div>
  </details>
 </section>;
}
