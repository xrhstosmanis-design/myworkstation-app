const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR");
export const assistantSalesQuestion=value=>/πωλ|πουλ|τζιρ|\b(?:sales|sold|selling)\b/.test(normalize(value));
export function salesOnlyQuestion(value){
 const text=normalize(value);
 return assistantSalesQuestion(text)&&!/ιδιοκαταναλ|καταστροφ|αποθεμ|στοκ|ταμει|μετρητ|ελλειμ|πλεονασ|eftpos|\b(?:stock|cash)\b/.test(text);
}
