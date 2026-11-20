import React from 'react';
// Native management field labels and values, isolated from editor/bootstrap hooks.
const columns={
 'banks.read':[['internalCode','Εσωτ. κωδ'],['name','Ονομασία'],['accountingAccount','Λογ. Λογιστικής'],['auxiliaryName','Βοηθητική ονομασία'],['active','Ενεργή']],
 'expense-categories.read':[['description','Περιγραφή'],['usageCount','Χρήσεις'],['active','Ενεργή']],
 'customer-categories.read':[['description','Περιγραφή'],['selectable','Με επιλογή'],['allowCredit','Με πίστωση'],['saleAtCostOrWholesale','Πώληση στην αγορά ή χονδρική'],['deferred','Ετεροχρονισμένη'],['usageCount','Χρήσεις'],['active','Ενεργή']],
 'professions.read':[['code','Κωδ'],['description','Περιγραφή'],['customerCount','Πελάτες'],['active','Ενεργό']],
 'shipping-methods.read':[['code','Κωδ'],['description','Περιγραφή'],['createdAt','Καταχώρηση'],['updatedAt','Ενημέρωση'],['active','Ενεργός']]
};
const date=value=>value?new Date(value).toLocaleString('el-GR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/Athens',hour12:false}):'—';
export default function ManagementCompanyReadList({capability,items}){return <div style={{overflowX:'auto'}}><table aria-label="Κατάλογος εταιρικής διαχείρισης"><thead><tr>{columns[capability].map(([key,label])=><th key={key} scope="col">{label}</th>)}</tr></thead><tbody>{items.map(row=><tr key={row.id}>{columns[capability].map(([key])=><td key={key}>{typeof row[key]==='boolean'?(row[key]?'Ναι':'Όχι'):key==='createdAt'||key==='updatedAt'?date(row[key]):row[key]??'—'}</td>)}</tr>)}</tbody></table></div>}
