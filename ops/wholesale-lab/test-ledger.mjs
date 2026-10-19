// Native HTTP/PostgreSQL acceptance helper. Never loaded by the demo runtime.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixedUnits} from './documents.mjs';
export async function exerciseLabLedger({baseUrl,ownerToken,db,origin,ids}){
  const [database]=await db.$queryRaw`SELECT current_database() AS "name"`;
  assert.equal(database.name,'wholesale_lab','never execute synthetic ledger fixtures on another database');
  const storeId=ids.store,headers={authorization:`Bearer ${ownerToken}`,'content-type':'application/json',origin};
  const call=async(path,body,expected=200)=>{const response=await fetch(baseUrl+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});const result=await response.json();assert.equal(response.status,expected,JSON.stringify({path,body:result}));return result};
  const state=()=>call('/api/lab/state?storeId='+storeId);
  const key=()=>crypto.randomUUID(),issue=(order,type,referenceId,requestId=key(),expected=201)=>call('/api/lab/documents',{storeId,orderId:order.orderId,type,requestId,...referenceId?{referenceId}:{}},expected);
  const cancel=(doc,requestId=key(),expected=200)=>call('/api/lab/documents/'+doc.id+'/cancel',{storeId,requestId},expected);
  const payment=(doc,amount,method,requestId=key(),expected=201)=>call('/api/lab/payments',{storeId,invoiceId:doc.id,amount,method,requestId},expected);
  const quantity=(s,p)=>fixedUnits(s.stock.find(r=>r.productId===p)?.quantity||'0',4);
  const balance=s=>s.receivables.reduce((sum,r)=>sum+fixedUnits(r.balance,2),0n);
  const controls=async()=>JSON.stringify(await db.$queryRaw`SELECT 'StoreProduct' AS "kind",row_to_json(s)::text AS "row" FROM "StoreProduct" s UNION ALL SELECT 'Sale',row_to_json(s)::text FROM "Sale" s UNION ALL SELECT 'StockMovement',row_to_json(s)::text FROM "StockMovement" s UNION ALL SELECT 'StoreTransaction',row_to_json(s)::text FROM "StoreTransaction" s ORDER BY "kind","row"`);
  const appendCounts=async()=>{const rows=await db.$queryRaw`SELECT (SELECT count(*)::int FROM "LabDocument") AS "documents",(SELECT count(*)::int FROM "LabCancellation") AS "cancellations",(SELECT count(*)::int FROM "LabStockEntry") AS "stocks",(SELECT count(*)::int FROM "LabReceivableEntry") AS "receivables",(SELECT count(*)::int FROM "LabPayment") AS "payments",(SELECT count(*)::int FROM "LabEvent") AS "events",(SELECT count(*)::int FROM "LabRequest") AS "requests"`;return rows[0]};
  async function order(items=[{productId:ids.productA,quantity:'2'}]){const body={storeId,customerId:ids.customer,items},quote=await call('/api/wholesale/quotes',body);return call('/api/wholesale/orders',{...body,quoteId:quote.quoteId,clientOrderId:key(),notes:'SYNTHETIC NATIVE LEDGER TEST'},201)}
  const initial=await state(),sourceBefore=await controls(),siblingBefore=await call('/api/lab/state?storeId='+ids.siblingStore),a0=quantity(initial,ids.productA),b0=quantity(initial,ids.productB),money0=balance(initial);
  const measured=[];

  // Invoice and dispatch are independent. Credit/return represent distinct effects.
  const first=await order([{productId:ids.productA,quantity:'2'},{productId:ids.productB,quantity:'3'}]);
  assert.equal(first.order.grossTotal,'41.75');
  const invoiceKey=key(),inv=(await issue(first,'INVOICE',undefined,invoiceKey)).document;
  let after=await state();assert.equal(quantity(after,ids.productA),a0);assert.equal(balance(after),money0+4175n);assert.equal(inv.grossTotal,'41.75');
  const replay=await issue(first,'INVOICE',undefined,invoiceKey);assert.equal(replay.replayed,true);assert.equal(replay.document.id,inv.id);
  const count=await appendCounts();await issue(first,'DELIVERY_NOTE',undefined,invoiceKey,409);assert.deepEqual(await appendCounts(),count);
  await issue(first,'INVOICE',undefined,key(),409);
  const dispatch=(await issue(first,'DELIVERY_NOTE')).document;after=await state();assert.equal(quantity(after,ids.productA),a0-20000n);assert.equal(quantity(after,ids.productB),b0-30000n);assert.equal(balance(after),money0+4175n);
  await issue(first,'DELIVERY_NOTE',undefined,key(),409);
  const returned=(await issue(first,'RETURN_NOTE',dispatch.id)).document;after=await state();assert.equal(quantity(after,ids.productA),a0);assert.equal(quantity(after,ids.productB),b0);assert.equal(balance(after),money0+4175n);
  await issue(first,'RETURN_NOTE',dispatch.id,key(),409);await cancel(dispatch,key(),409);
  const exhaust=await order([{productId:ids.productA,quantity:'100'}]),exhaustDelivery=(await issue(exhaust,'DELIVERY_NOTE')).document,exhaustCounts=await appendCounts();
  await cancel(returned,key(),409);assert.deepEqual(await appendCounts(),exhaustCounts);assert.equal(quantity(await state(),ids.productA),a0-1000000n);await cancel(exhaustDelivery);
  await cancel(returned);after=await state();assert.equal(quantity(after,ids.productA),a0-20000n);
  const cancelKey=key();assert.equal((await cancel(dispatch,cancelKey)).document.status,'CANCELLED');assert.equal((await cancel(dispatch,cancelKey)).replayed,true);await cancel(dispatch,key(),409);await cancel(inv);
  after=await state();assert.equal(quantity(after,ids.productA),a0);assert.equal(quantity(after,ids.productB),b0);assert.equal(balance(after),money0);
  measured.push('invoice/delivery/return/cancellation/replay/payload-conflict measured before and after');

  const second=await order([{productId:ids.productA,quantity:'1'}]),secondInvoice=(await issue(second,'INVOICE')).document;
  const credit=(await issue(second,'CREDIT_NOTE',secondInvoice.id)).document;after=await state();assert.equal(balance(after),money0);assert.equal(quantity(after,ids.productA),a0);
  await issue(second,'CREDIT_NOTE',secondInvoice.id,key(),409);await cancel(secondInvoice,key(),409);await cancel(credit);assert.equal(balance(await state()),money0+1240n);await cancel(secondInvoice);assert.equal(balance(await state()),money0);
  measured.push('full credit and cancellation reverse only receivable; stock remains unchanged');

  const paidOrder=await order(),combined=(await issue(paidOrder,'INVOICE_DELIVERY')).document;after=await state();assert.equal(quantity(after,ids.productA),a0-20000n);assert.equal(balance(after),money0+2480n);
  const paymentKey=key(),cash=await payment(combined,'10.00','CASH',paymentKey);assert.equal(cash.payment.amount,'10.00');assert.equal(balance(await state()),money0+1480n);
  const reordered=await call('/api/lab/payments',{requestId:paymentKey,method:'CASH',amount:'10',invoiceId:combined.id,storeId},201);assert.equal(reordered.replayed,true);assert.equal(reordered.payment.id,cash.payment.id);
  await payment(combined,'10.01','CASH',paymentKey,409);await payment(combined,'5.00','BANK');assert.equal(balance(await state()),money0+980n);await payment(combined,'9.80','CARD');assert.equal(balance(await state()),money0);
  const paidCounts=await appendCounts();await payment(combined,'0.01','CARD',key(),409);await cancel(combined,key(),409);await issue(paidOrder,'CREDIT_NOTE',combined.id,key(),409);assert.deepEqual(await appendCounts(),paidCounts);
  for(const amount of ['0','-1','1.001'])await payment(combined,amount,'CASH',key(),400);
  measured.push('partial CASH/BANK/CARD exact payments, normalized replay and overpay/paid-reversal refusal');

  // Independent orders competing for the same virtual stock must not oversell.
  const partialFailure=await order([{productId:ids.productA,quantity:'1'},{productId:ids.productB,quantity:'1000'}]),partialCounts=await appendCounts(),partialState=await state();
  await issue(partialFailure,'INVOICE_DELIVERY',undefined,key(),409);assert.deepEqual(await appendCounts(),partialCounts);assert.equal(quantity(await state(),ids.productA),quantity(partialState,ids.productA));
  const available=quantity(await state(),ids.productA);assert.ok(available>=600000n&&available<1200000n);
  const [oversellA,oversellB]=await Promise.all([order([{productId:ids.productA,quantity:'60'}]),order([{productId:ids.productA,quantity:'60'}])]);
  const races=await Promise.all([oversellA,oversellB].map(async o=>{const response=await fetch(baseUrl+'/api/lab/documents',{method:'POST',headers,body:JSON.stringify({storeId,orderId:o.orderId,type:'DELIVERY_NOTE',requestId:key()})});return {status:response.status,body:await response.json()}}));
  assert.deepEqual(races.map(r=>r.status).sort(),[201,409]);assert.equal(races.find(r=>r.status===409).body.code,'LAB_STOCK_INSUFFICIENT');assert.equal(quantity(await state(),ids.productA),available-600000n);await cancel(races.find(r=>r.status===201).body.document);assert.equal(quantity(await state(),ids.productA),available);
  const sameOrder=await order(),sameKey=key(),same=await Promise.all([issue(sameOrder,'INVOICE',undefined,sameKey),issue(sameOrder,'INVOICE',undefined,sameKey)]);assert.equal(same[0].document.id,same[1].document.id);assert.deepEqual(same.map(r=>r.replayed).sort(),[false,true]);await cancel(same[0].document);
  const another=await order(),different=await Promise.all([1,2].map(async()=>{const response=await fetch(baseUrl+'/api/lab/documents',{method:'POST',headers,body:JSON.stringify({storeId,orderId:another.orderId,type:'INVOICE',requestId:key()})});return {status:response.status,body:await response.json()}}));assert.deepEqual(different.map(r=>r.status).sort(),[201,409]);await cancel(different.find(r=>r.status===201).body.document);
  measured.push('real concurrent distinct-order oversell, same-key replay and different-key duplicate invoice');

  // Force the final event write to fail, after document/stock/receivable inserts.
  const rollbackOrder=await order(),rollbackBefore=await appendCounts(),rollbackState=await state();
  await db.$executeRawUnsafe(`CREATE FUNCTION lab_test_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."kind"='VIRTUAL_DOCUMENT_ISSUED' THEN RAISE EXCEPTION 'synthetic final-event rollback'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER "LabTestEventFailure" BEFORE INSERT ON "LabEvent" FOR EACH ROW EXECUTE FUNCTION lab_test_event_failure()');
  try{await issue(rollbackOrder,'INVOICE_DELIVERY',undefined,key(),500)}finally{await db.$executeRawUnsafe('DROP TRIGGER "LabTestEventFailure" ON "LabEvent"');await db.$executeRawUnsafe('DROP FUNCTION lab_test_event_failure()')}
  assert.deepEqual(await appendCounts(),rollbackBefore);after=await state();assert.equal(quantity(after,ids.productA),quantity(rollbackState,ids.productA));assert.equal(balance(after),balance(rollbackState));
  const afterRollback=(await issue(rollbackOrder,'INVOICE_DELIVERY')).document;await cancel(afterRollback);
  const immutableBefore=await appendCounts();await assert.rejects(db.$executeRawUnsafe('UPDATE "LabDocument" SET "type"=\'INVOICE\' WHERE "id"=$1',combined.id),/append-only/);await assert.rejects(db.$executeRawUnsafe('DELETE FROM "LabStockEntry" WHERE "documentId"=$1',combined.id),/append-only/);assert.deepEqual(await appendCounts(),immutableBefore);
  measured.push('forced final-event rollback is atomic across all seven ledgers; append-only DB enforcement');

  const pdfResponse=await fetch(baseUrl+`/api/lab/documents/${combined.id}/pdf?storeId=${storeId}`,{headers}),pdf=Buffer.from(await pdfResponse.arrayBuffer());assert.equal(pdfResponse.status,200);assert.match(pdfResponse.headers.get('content-type'),/application\/pdf/);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.match(pdf.toString('latin1'),/NO FISCAL VALIDITY/);
  await call('/api/lab/state?storeId='+ids.foreignStore,undefined,404);await call('/api/lab/state?storeId=',undefined,400);
  const final=await state();assert.equal(quantity(final,ids.productA),a0-20000n);assert.equal(quantity(final,ids.productB),b0);assert.equal(balance(final),money0);assert.equal(await controls(),sourceBefore);assert.deepEqual(await call('/api/lab/state?storeId='+ids.siblingStore),siblingBefore);
  measured.push('PDF, exact-store/foreign denial, unchanged actual ledgers and sibling control');
  return {testOnly:true,scope:'native isolated HTTP/PostgreSQL virtual-ledger acceptance',measured,initial:{productA:initial.stock.find(r=>r.productId===ids.productA).quantity,productB:initial.stock.find(r=>r.productId===ids.productB).quantity},final:{productA:final.stock.find(r=>r.productId===ids.productA).quantity,productB:final.stock.find(r=>r.productId===ids.productB).quantity},sourceControlsUnchanged:true};
}
