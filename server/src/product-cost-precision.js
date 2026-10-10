// Preserve the existing ten integer digits and widen purchase cost only.
// Called by deployment bootstrap, never by a preview/import request.
export async function readProductCostStorage(db){
  const [column]=await db.$queryRaw`SELECT data_type,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='Product' AND column_name='costPrice'`;
  return column;
}
export function supportsSourceCost(column){
  return column?.data_type==='numeric' && (column.numeric_precision===null || (Number(column.numeric_scale)>=6 && Number(column.numeric_precision)-Number(column.numeric_scale)>=10));
}
export async function assertSourceCostStorage(db){
  if(!supportsSourceCost(await readProductCostStorage(db))){
    const error=new Error('Η βάση δεν υποστηρίζει την ακριβή τιμή αγοράς της πηγής (6 δεκαδικά). Δεν εισήχθη κανένα είδος.');error.status=409;throw error;
  }
}
export async function ensureProductCostPrecision(db){
  const column=await readProductCostStorage(db);
  if(supportsSourceCost(column))return;
  if(column?.data_type!=='numeric'||Number(column.numeric_precision)!==14||Number(column.numeric_scale)!==4)throw new Error('Unexpected Product.costPrice storage; refusing precision alteration.');
  await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
    await tx.$executeRawUnsafe('LOCK TABLE "Product" IN ACCESS EXCLUSIVE MODE');
    const current=await readProductCostStorage(tx);
    if(supportsSourceCost(current))return;
    if(current?.data_type!=='numeric'||Number(current.numeric_precision)!==14||Number(current.numeric_scale)!==4)throw new Error('Product.costPrice storage changed during bootstrap.');
    await tx.$executeRawUnsafe('ALTER TABLE "Product" ALTER COLUMN "costPrice" TYPE NUMERIC(16,6)');
    await assertSourceCostStorage(tx);
  },{maxWait:10000,timeout:45000});
}

// Exact decimal digit checks: no tolerance, rounding or mutation of the value.
export function fitsSourcePrice(value,scale){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)return false;
  const [mantissa,exponent='0']=String(value).toLowerCase().split('e');
  const [whole,fraction='']=mantissa.split('.');
  const decimals=Math.max(0,fraction.length-Number(exponent));
  return decimals<=scale&&value<10000000000;
}
