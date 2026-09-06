import crypto from "crypto";

function normalizedNumber(value){
  const number=Number(value||0);
  return Number.isFinite(number)?number:0;
}

function sortValue(value){
  if(Array.isArray(value))return value.map(sortValue);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sortValue(value[key])]));
  return value;
}

export function canonicalJson(value){
  return JSON.stringify(sortValue(value));
}

export function fiscalEnvelopeHash(envelope){
  return crypto.createHash("sha256").update(canonicalJson(envelope)).digest("hex");
}

export function buildFiscalDryRunEnvelope({sale,lines,payments,route}){
  return {
    schemaVersion:"MWS_FISCAL_DRY_RUN_V1",
    mode:"DRY_RUN",
    externalExecution:false,
    idempotencyKey:`fiscal-dry-run:${sale.id}:mws-v1`,
    sale:{
      id:sale.id,
      source:sale.source,
      occurredAt:new Date(sale.occurredAt||sale.createdAt).toISOString(),
      subtotal:normalizedNumber(sale.subtotal),
      discount:normalizedNumber(sale.discount),
      total:normalizedNumber(sale.total),
      fiscalStatus:sale.fiscalStatus
    },
    route:{
      terminalPos:route.terminalPos,
      channel:route.channel,
      fiscalDeviceCode:route.fiscalDeviceCode,
      eftposDeviceCode:route.eftposDeviceCode,
      role:route.role
    },
    lines:lines.map(line=>({
      lineId:line.id,
      productId:line.productId||null,
      description:line.description,
      quantity:normalizedNumber(line.quantity),
      unitPrice:normalizedNumber(line.unitPrice),
      discount:normalizedNumber(line.discount),
      vatRate:normalizedNumber(line.vatRate),
      lineTotal:normalizedNumber(line.lineTotal)
    })),
    payments:payments.map(payment=>({method:payment.method,amount:normalizedNumber(payment.amount)}))
  };
}

export function validateFiscalDryRun({sale,lines,payments,route,terminalPos}){
  const errors=[];
  if(!sale)errors.push("SALE_NOT_FOUND");
  if(sale&&sale.status!=="COMPLETED")errors.push("SALE_NOT_COMPLETED");
  if(sale&&sale.fiscalStatus!=="NON_FISCAL")errors.push("SALE_NOT_NON_FISCAL");
  if(!lines?.length)errors.push("SALE_LINES_MISSING");
  if(!payments?.length)errors.push("SALE_PAYMENTS_MISSING");
  if(!route)errors.push("TERMINAL_ROUTE_MISSING");
  if(route&&route.terminalPos!==terminalPos)errors.push("TERMINAL_ROUTE_MISMATCH");
  if(route&&!route.fiscalDeviceCode)errors.push("FISCAL_DEVICE_MISSING");
  const lineTotal=(lines||[]).reduce((sum,line)=>sum+normalizedNumber(line.lineTotal),0);
  const paymentTotal=(payments||[]).reduce((sum,payment)=>sum+normalizedNumber(payment.amount),0);
  const saleTotal=normalizedNumber(sale?.total);
  if(Math.abs(lineTotal-saleTotal)>0.01)errors.push("LINE_TOTAL_MISMATCH");
  if(Math.abs(paymentTotal-saleTotal)>0.01)errors.push("PAYMENT_TOTAL_MISMATCH");
  return {ok:errors.length===0,errors,totals:{sale:saleTotal,lines:lineTotal,payments:paymentTotal}};
}
