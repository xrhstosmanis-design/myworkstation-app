export function walletMoney(value){return (Number(value||0)/1000000).toLocaleString('el-GR',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:6})}
export function walletMicrosFromEuros(input){
  const value=String(input||'').trim().replace(',','.');
  if(!/^\d{1,7}(\.\d{1,2})?$/.test(value))throw new Error('Γράψε θετικό ποσό σε ευρώ με έως δύο δεκαδικά.');
  const [whole,decimal='']=value.split('.'),micros=BigInt(whole)*1000000n+BigInt(decimal.padEnd(2,'0'))*10000n;
  if(micros<=0n||micros>1000000000000n)throw new Error('Το ποσό πρέπει να είναι από 0,01 έως 1.000.000 ευρώ.');
  return String(micros);
}
