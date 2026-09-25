const keyOf=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,'');

export function validateExplicitCodeRules(input){
  if(!Array.isArray(input)||!input.length||input.length>100)throw new Error('Επίλεξε από 1 έως 100 διορθώσεις κωδικού.');
  const seen=new Set();
  return input.map(rule=>{
    const observedCode=String(rule?.observedCode||'').trim(),canonicalCode=String(rule?.canonicalCode||'').trim(),description=String(rule?.description||'').trim();
    const key=keyOf(observedCode),canonicalKey=keyOf(canonicalCode),descriptionKey=keyOf(description);
    if(!key||!canonicalKey||!descriptionKey||seen.has(key)||observedCode.length>80||canonicalCode.length>80||description.length>300)throw new Error('Έλεγξε τον αρχικό κωδικό, τον σωστό κωδικό και την περιγραφή.');
    seen.add(key);return {key,observedCode,canonicalCode,canonicalKey,description,descriptionKey};
  });
}

export function applyExplicitCodeRules(previous,rules){
  const codeCorrections={...(previous?.codeCorrections||{})};
  for(const rule of rules)codeCorrections[rule.key]={observedCode:rule.observedCode,canonicalCode:rule.canonicalCode,description:rule.description,descriptionKey:rule.descriptionKey,verified:true,source:'SUPER_ADMIN_CODE_CORRECTION'};
  return {...previous,codeCorrections};
}

export function applyVerifiedCodeCorrections(lines,profile){
  const rules=profile?.codeCorrections&&typeof profile.codeCorrections==='object'?profile.codeCorrections:{};
  return (lines||[]).map(line=>{
    const rule=rules[keyOf(line?.supplierItemCode||line?.code)];
    if(!rule?.verified||!rule.canonicalCode||keyOf(line?.description)!==rule.descriptionKey)return line;
    return {...line,supplierItemCode:rule.canonicalCode,codeCorrectionApplied:true,observedSupplierItemCode:line?.supplierItemCode||line?.code||'',supplierProfileRecovered:true,supplierProfileRule:'SUPPLIER_CODE_CORRECTION'};
  });
}
