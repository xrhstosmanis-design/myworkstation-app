export function normalizeSalesProductSearch(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('el-GR').replace(/ς/g,'σ');
}
export function salesProductSearch(value=''){
  if(typeof value!=='string'||value.length>160)throw Object.assign(new Error('Η αναζήτηση είδους δέχεται έως 160 χαρακτήρες.'),{status:400});
  const text=value.trim(),normalized=normalizeSalesProductSearch(text);
  return {text,normalized,like:`%${normalized.replace(/[\\%_]/g,'\\$&')}%`};
}
export const matchesSalesProductSearch=(search,...values)=>!search.normalized||values.flat().some(value=>normalizeSalesProductSearch(value).includes(search.normalized));
