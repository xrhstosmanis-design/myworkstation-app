export const KAT_DELAYED_TERMINAL_PURPOSE="KAT_DELAYED_DELIVERY";

export function normalizeTerminalPos(value){
  return String(value||"").trim().toUpperCase().slice(0,120);
}

export function resolveKatOnlineRouting({configuredTerminalPos,currentTerminalPos}={}){
  const configured=normalizeTerminalPos(configuredTerminalPos);
  const current=normalizeTerminalPos(currentTerminalPos);
  if(!configured){
    const error=new Error("Δεν έχει οριστεί το ετεροχρονισμένο POS/Ταμείο 2 για τις online παραγγελίες ΚΑΤ.");
    error.code="KAT_DELAYED_TERMINAL_NOT_CONFIGURED";
    error.status=409;
    throw error;
  }
  if(current&&current!==configured){
    const error=new Error("Η online παραγγελία ολοκληρώνεται μόνο από το ετεροχρονισμένο POS/Ταμείο 2.");
    error.code="KAT_ONLINE_WRONG_TERMINAL";
    error.status=409;
    throw error;
  }
  return {terminalPos:configured,delayed:true,purpose:KAT_DELAYED_TERMINAL_PURPOSE};
}

export async function configuredKatDelayedTerminal(tx,{companyId,storeId,currentTerminalPos}={}){
  const environmentTerminal=normalizeTerminalPos(process.env.KAT_DELAYED_TERMINAL_POS);
  if(environmentTerminal)return environmentTerminal;

  const requestedTerminal=normalizeTerminalPos(currentTerminalPos);
  if(!requestedTerminal)return "";

  const tables=await tx.$queryRaw`SELECT to_regclass('public."StoreFiscalDevice"')::text AS fiscal,to_regclass('public."StoreEftposDevice"')::text AS eftpos`;
  if(!tables[0]?.fiscal||!tables[0]?.eftpos)return "";

  const rows=await tx.$queryRaw`
    SELECT DISTINCT f."terminalPos"
    FROM "StoreFiscalDevice" f
    JOIN "StoreEftposDevice" e
      ON e."companyId"=f."companyId"
     AND e."storeId"=f."storeId"
     AND e."fiscalDeviceCode"=f."deviceCode"
     AND e."active"=TRUE
     AND e."role"='DELIVERY'
    WHERE f."companyId"=${companyId}
      AND f."storeId"=${storeId}
      AND f."active"=TRUE
      AND UPPER(TRIM(f."terminalPos"))=${requestedTerminal}
      AND NULLIF(TRIM(f."terminalPos"),'') IS NOT NULL
    ORDER BY f."terminalPos"`;
  if(rows.length!==1)return "";
  return normalizeTerminalPos(rows[0].terminalPos);
}
