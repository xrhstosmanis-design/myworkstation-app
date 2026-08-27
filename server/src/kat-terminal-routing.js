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
